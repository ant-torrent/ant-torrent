import type { AccentKey } from '@/stores/appStore'

/** 主题色预设（label 走 i18n: accent.<key>） */
export const ACCENTS: Record<AccentKey, { color: string; labelKey: string }> = {
  blue: { color: '#1677ff', labelKey: 'accent.blue' },
  violet: { color: '#722ed1', labelKey: 'accent.violet' },
  cyan: { color: '#13c2c2', labelKey: 'accent.cyan' },
  green: { color: '#52c41a', labelKey: 'accent.green' },
  orange: { color: '#fa8c16', labelKey: 'accent.orange' },
  magenta: { color: '#eb2f96', labelKey: 'accent.magenta' },
}

/** 状态语义色（深浅色主题下都保持可读） */
export const STATUS_COLORS = {
  success: '#52c41a',
  processing: '#1677ff',
  warning: '#faad14',
  error: '#ff4d4f',
  default: '#8c8c8c',
} as const
