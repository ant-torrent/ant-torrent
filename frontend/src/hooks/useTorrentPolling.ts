import { useEffect } from 'react'

import type { ServerConfig } from '@/services/api/client'
import { torrentOps } from '@/services/api/torrentOps'
import type { SpeedSample } from '@/services/types'
import { useAppStore } from '@/stores/appStore'
import { useTorrentStore } from '@/stores/torrentStore'

import { useInterval } from './useInterval'

/** 轮询周期（qB WebUI 自身约 2s 刷新一次 maindata） */
const POLL_MS = 2000
/** 速度图保留的采样数（与原模拟器图表深度一致） */
const HISTORY_LIMIT = 120

/** 追加一次速度采样并裁剪到 HISTORY_LIMIT */
function appendSample(history: SpeedSample[], dl: number, up: number): SpeedSample[] {
  const next = [...history, { t: Date.now(), dl, up }]
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next
}

/** 轮询单台服务器：成功写快照（history 追加当前速度），失败标记错误并保留旧数据 */
async function pollServer(srv: ServerConfig): Promise<void> {
  const { serverData, applyServerSnapshot, markServerError } = useTorrentStore.getState()
  try {
    // 按下载器类型分发（qB 走代理，Transmission 走规范化端点），返回统一的 UI 模型
    const { torrents, server } = await torrentOps(srv).getSnapshot()
    const prev = serverData[srv.id]
    applyServerSnapshot(srv.id, {
      torrents,
      server,
      history: appendSample(prev?.history ?? [], server.dl_info_speed, server.up_info_speed),
    })
  } catch (err) {
    markServerError(srv.id, err instanceof Error ? err.message : String(err))
  }
}

/** 全量轮询：各服务器并行、互不影响；上一轮未结束时跳过本轮防重入 */
export async function pollAllServers(): Promise<void> {
  if (pollAllServers.running) return
  pollAllServers.running = true
  try {
    const servers = useAppStore.getState().servers
    await Promise.allSettled(servers.map((srv) => pollServer(srv)))
  } finally {
    pollAllServers.running = false
  }
}
// 挂函数属性而非模块变量，避免 HMR 重复声明时状态错乱
pollAllServers.running = false

/** 立即刷新单台服务器（种子操作后反馈 / 错误重试按钮） */
export async function refreshServer(serverId: string): Promise<void> {
  const srv = useAppStore.getState().servers.find((s) => s.id === serverId)
  if (srv) await pollServer(srv)
}

/**
 * 应用级轮询：挂载一次（App.tsx），持续刷新所有服务器的快照。
 * 轮询全部服务器而非仅当前服务器 —— 仪表盘每服务器卡片需要全量数据，
 * 且切换服务器时数据即时可用。
 */
export function useTorrentPolling() {
  const serverIds = useAppStore((s) => s.servers.map((x) => x.id).join(','))
  const serversLoading = useAppStore((s) => s.serversLoading)

  useInterval(() => {
    void pollAllServers()
  }, serversLoading || !serverIds ? null : POLL_MS)

  // 服务器集合变化（首次加载/增删）时：立即全量轮询 + 清理已删除服务器的残留分片
  useEffect(() => {
    if (serversLoading || !serverIds) return
    void pollAllServers()
    useTorrentStore.getState().pruneServerData(serverIds.split(','))
  }, [serverIds, serversLoading])
}
