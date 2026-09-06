import { useMemo } from 'react'

import { STATUS_GROUPS, STATUS_GROUP_OF, type StatusGroup } from '@/services/status'
import type { Torrent } from '@/services/types'

export interface TorrentStats {
  total: number
  groupCounts: Record<StatusGroup, number>
  /** 有下载速度的种子按速度降序（看板 Top-N 用） */
  topDownloads: Torrent[]
  /** 有上传速度的种子按速度降序（看板 Top-N 用） */
  topUploads: Torrent[]
  sumDlSpeed: number
  sumUpSpeed: number
}

/** 从种子数组派生统计（Tabs 计数 / 看板状态分布共用） */
export function useTorrentStats(torrents: Torrent[]): TorrentStats {
  return useMemo(() => {
    const groupCounts = Object.fromEntries(STATUS_GROUPS.map((g) => [g, 0])) as Record<StatusGroup, number>
    let sumDlSpeed = 0
    let sumUpSpeed = 0
    const active: Torrent[] = []
    const uploading: Torrent[] = []

    for (const t of torrents) {
      groupCounts[STATUS_GROUP_OF[t.state]] += 1
      sumDlSpeed += t.dlspeed
      sumUpSpeed += t.upspeed
      if (t.dlspeed > 0) active.push(t)
      if (t.upspeed > 0) uploading.push(t)
    }
    active.sort((a, b) => b.dlspeed - a.dlspeed)
    uploading.sort((a, b) => b.upspeed - a.upspeed)

    return {
      total: torrents.length,
      groupCounts,
      topDownloads: active.slice(0, 5),
      topUploads: uploading.slice(0, 5),
      sumDlSpeed,
      sumUpSpeed,
    }
  }, [torrents])
}
