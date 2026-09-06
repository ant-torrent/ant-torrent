import dayjs from 'dayjs'

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const

/** 字节数 → 可读大小（二进制单位，与 qBittorrent 一致） */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes === 0) return '0 B'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(precision)} ${UNITS[unit]}`
}

/** 字节/秒 → 可读速度 */
export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 B/s'
  return `${formatBytes(bytesPerSec)}/s`
}

export function formatPercent(progress: number): string {
  return `${(progress * 100).toFixed(1)}%`
}

export function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio < 0) return '∞'
  return ratio.toFixed(2)
}

/**
 * 秒数 → 紧凑时长，如 "3d 4h" / "12m 30s" / "45s"
 * （locale 无关的紧凑格式，看板/表格通用）
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '-'
  const s = Math.floor(seconds)
  if (s < 60) return `${s}s`
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m ${s % 60}s`
}

/** qBittorrent 约定 eta = 8640000 表示无限期 */
export const ETA_INFINITY = 8640000

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds >= ETA_INFINITY || seconds < 0) return '∞'
  return formatDuration(seconds)
}

export function formatDateTime(epochSeconds: number): string {
  if (!epochSeconds || epochSeconds < 0) return '-'
  return dayjs.unix(epochSeconds).format('YYYY-MM-DD HH:mm')
}
