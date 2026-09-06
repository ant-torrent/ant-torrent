import { LaptopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Segmented, Tooltip } from 'antd'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useAppStore } from '@/stores/appStore'
import type { ThemeMode } from '@/stores/appStore'

const OPTIONS: { value: ThemeMode; icon: ReactNode }[] = [
  { value: 'light', icon: <SunOutlined /> },
  { value: 'system', icon: <LaptopOutlined /> },
  { value: 'dark', icon: <MoonOutlined /> },
]

export default function ThemeSwitch() {
  const { t } = useTranslation()
  const themeMode = useAppStore((s) => s.themeMode)
  const setThemeMode = useAppStore((s) => s.setThemeMode)

  return (
    <Segmented
      size="small"
      value={themeMode}
      onChange={(value) => setThemeMode(value as ThemeMode)}
      options={OPTIONS.map(({ value, icon }) => ({
        value,
        icon: <Tooltip title={t(`theme.${value}`)}>{icon}</Tooltip>,
      }))}
    />
  )
}
