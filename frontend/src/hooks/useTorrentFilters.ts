import { useState, useMemo } from 'react'
import { TORRENT_FILTER_MATCH, type TorrentFilterKey } from '@/services/status'
import type { Torrent } from '@/services/types'
import { splitTags, trackerDomain } from '@/utils/misc'
import { useDebouncedValue } from './useDebouncedValue'

/** 「未分类」筛选项哨兵值（qB 中未分类种子的 category 为空串） */
export const UNCATEGORIZED = '__uncategorized__'
/** 「无标签」筛选项哨兵值（qB 中无标签种子的 tags 为空串） */
export const UNTAGGED = '__untagged__'

export interface TorrentFilters {
  /** qB filter 枚举多选（OR 匹配），空 = 不过滤 */
  statuses: TorrentFilterKey[]
  /** 分类多选（含 UNCATEGORIZED 哨兵），空 = 不过滤 */
  categories: string[]
  /** 标签多选（含 UNTAGGED 哨兵），空 = 不过滤 */
  tags: string[]
  /** Tracker 域名（单选；'' = 不过滤） */
  tracker: string
  search: string
}

const INITIAL_FILTERS: TorrentFilters = {
  statuses: [],
  categories: [],
  tags: [],
  tracker: '',
  search: '',
}

/**
 * 当前服务器种子列表的筛选器（单服务器视图，无 server 维度；
 * 服务器切换由页面的服务器 Tab 负责）。
 * 数据已全量在本地，全部为前端过滤；切换服务器时由页面重置分类/标签/Tracker。
 */
export function useTorrentFilters(torrents: Torrent[]) {
  const [filters, setFilters] = useState<TorrentFilters>(INITIAL_FILTERS)

  const debouncedSearch = useDebouncedValue(filters.search, 300)

  /** 重置与服务器数据绑定的筛选项（分类/标签/Tracker 域名集合随服务器变化） */
  const resetServerScopedFilters = useMemo(
    () => () => setFilters((f) => ({ ...f, categories: [], tags: [], tracker: '' })),
    [],
  )

  // Tracker 域名集合（选项来源：当前服务器的种子主 tracker）
  const trackerDomains = useMemo(() => {
    const domains = new Set<string>()
    torrents.forEach((t) => {
      if (t.tracker) domains.add(trackerDomain(t.tracker))
    })
    return Array.from(domains).sort()
  }, [torrents])

  // Filter pipeline
  const filteredTorrents = useMemo(() => {
    let result = torrents

    // 状态多选：任一命中即保留（OR）
    if (filters.statuses.length > 0) {
      const matchers = filters.statuses.map((key) => TORRENT_FILTER_MATCH[key])
      result = result.filter((t) => matchers.some((match) => match(t)))
    }

    // 分类多选：命中任一选中分类；含哨兵时「未分类」（空 category）也算命中
    if (filters.categories.length > 0) {
      const wantUncategorized = filters.categories.includes(UNCATEGORIZED)
      const selected = new Set(
        wantUncategorized ? filters.categories.filter((c) => c !== UNCATEGORIZED) : filters.categories,
      )
      result = result.filter(
        (t) => (wantUncategorized && !t.category) || (t.category !== '' && selected.has(t.category)),
      )
    }

    // 标签多选：种子标签与选中标签有交集；含哨兵时「无标签」（空 tags）也算命中
    if (filters.tags.length > 0) {
      const wantUntagged = filters.tags.includes(UNTAGGED)
      const selected = new Set(
        wantUntagged ? filters.tags.filter((tag) => tag !== UNTAGGED) : filters.tags,
      )
      result = result.filter((t) => {
        const list = splitTags(t.tags ?? '')
        if (list.length === 0) return wantUntagged
        return list.some((tag) => selected.has(tag))
      })
    }

    // Tracker 域名过滤
    if (filters.tracker) {
      result = result.filter((t) => trackerDomain(t.tracker) === filters.tracker)
    }

    // 名称搜索
    if (debouncedSearch) {
      const search = debouncedSearch.toLowerCase()
      result = result.filter((t) => t.name.toLowerCase().includes(search))
    }

    return result
  }, [torrents, filters.statuses, filters.categories, filters.tags, filters.tracker, debouncedSearch])

  return {
    filters,
    setFilters,
    resetServerScopedFilters,
    filteredTorrents,
    trackerDomains,
  }
}
