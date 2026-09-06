import { useCallback, useEffect, useMemo, useState } from 'react'
import { qbtApi } from '@/services/api/client'

/**
 * 服务器的分类/标签全集（筛选下拉数据源）。
 * 与种子行内提取的区别：服务器上定义了但当前无种子使用的分类/标签也会出现。
 * 服务器切换时重新拉取；失败静默回退空列表（筛选缺选项不阻塞列表本身）。
 *
 * opts.skipFetch 为 true（如 Transmission 无分类/标签注册表）时不发请求，
 * 分类恒为空，标签从 fallbackTags（调用方由种子 labels 并集推导）渲染期派生。
 */
export function useServerTaxonomy(
  serverId: string | null,
  opts?: { skipFetch?: boolean; fallbackTags?: string[] },
) {
  const skipFetch = opts?.skipFetch ?? false
  const fallbackTags = opts?.fallbackTags
  const [fetchedCategories, setFetchedCategories] = useState<string[]>([])
  const [fetchedTags, setFetchedTags] = useState<string[]>([])
  const [reloadSeq, setReloadSeq] = useState(0)

  useEffect(() => {
    if (!serverId || skipFetch) {
      setFetchedCategories([])
      setFetchedTags([])
      return
    }
    let cancelled = false
    void Promise.allSettled([qbtApi.getCategories(serverId), qbtApi.getTags(serverId)]).then(
      ([catRes, tagRes]) => {
        if (cancelled) return
        setFetchedCategories(
          catRes.status === 'fulfilled'
            ? catRes.value.map((c) => c.name).sort((a, b) => a.localeCompare(b))
            : [],
        )
        setFetchedTags(tagRes.status === 'fulfilled' ? [...tagRes.value].sort((a, b) => a.localeCompare(b)) : [])
      },
    )
    return () => {
      cancelled = true
    }
  }, [serverId, skipFetch, reloadSeq])

  const refresh = useCallback(() => setReloadSeq((s) => s + 1), [])

  // skipFetch：渲染期派生（标签随种子 labels 即时更新），不发请求
  const tags = useMemo(
    () =>
      skipFetch
        ? [...new Set(fallbackTags ?? [])].sort((a, b) => a.localeCompare(b))
        : fetchedTags,
    [skipFetch, fallbackTags, fetchedTags],
  )

  return { categories: skipFetch ? [] : fetchedCategories, tags, refresh }
}
