import { ConfigProvider, theme as antdTheme } from 'antd'
import type { ThemeConfig } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { useAppStore } from '@/stores/appStore'

import { ANTD_LOCALES, DAYJS_LOCALES } from '@/i18n/antdLocales'
import { ACCENTS } from './tokens'

/** 解析 themeMode → 实际深浅色，system 模式实时监听系统偏好（免刷新） */
function useResolvedDark(mode: 'light' | 'dark' | 'system'): boolean {
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return systemDark
}

/** 把 token 层面的全局效果落到 document 上（body 背景 / 滚动条配色 / lang） */
function ThemeEffects({ isDark }: { isDark: boolean }) {
  const { token } = antdTheme.useToken()
  useEffect(() => {
    document.body.style.background = token.colorBgLayout
    document.body.style.color = token.colorText
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
  }, [token, isDark])
  return null
}

/** 任意组件可用的暗色判定（解析 appStore.themeMode + system 偏好，如图表主题切换） */
export function useIsDark(): boolean {
  const themeMode = useAppStore((s) => s.themeMode)
  return useResolvedDark(themeMode)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeMode = useAppStore((s) => s.themeMode)
  const accent = useAppStore((s) => s.accent)
  const locale = useAppStore((s) => s.locale)
  const isDark = useResolvedDark(themeMode)

  useEffect(() => {
    document.documentElement.lang = locale
    dayjs.locale(DAYJS_LOCALES[locale])
  }, [locale])

  const themeConfig = useMemo<ThemeConfig>(
    () => ({
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: ACCENTS[accent].color,
        colorInfo: ACCENTS[accent].color,
        colorLink: ACCENTS[accent].color,
        borderRadius: 8,
        fontSize: 14,
        colorBgLayout: isDark ? '#0f0f11' : '#f5f6f8',
      },
      components: {
        Layout: {
          headerBg: isDark ? '#151517' : '#ffffff',
          siderBg: isDark ? '#111114' : '#ffffff',
          headerHeight: 56,
        },
        Menu: {
          itemBg: 'transparent',
          subMenuItemBg: 'transparent',
          itemBorderRadius: 8,
          itemMarginInline: 10,
          itemHeight: 42,
          activeBarBorderWidth: 0,
        },
        Table: {
          headerBg: isDark ? '#1b1b1e' : '#fafafa',
        },
        Card: {
          paddingLG: 20,
        },
      },
    }),
    [isDark, accent],
  )

  return (
    <ConfigProvider theme={themeConfig} locale={ANTD_LOCALES[locale]}>
      <ThemeEffects isDark={isDark} />
      {children}
    </ConfigProvider>
  )
}
