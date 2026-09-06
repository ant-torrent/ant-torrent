import { CheckOutlined, GlobalOutlined } from '@ant-design/icons'
import { Button, Dropdown, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { useTranslation } from 'react-i18next'

import { useAppStore } from '@/stores/appStore'
import type { Locale } from '@/stores/appStore'

const LOCALES: Locale[] = ['zh-CN', 'en-US']

export default function LangSwitch() {
  const { t } = useTranslation()
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)

  const items: MenuProps['items'] = LOCALES.map((l) => ({
    key: l,
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {t(`lang.${l}`)}
        {locale === l && <CheckOutlined />}
      </span>
    ),
  }))

  return (
    <Dropdown
      menu={{ items, selectedKeys: [locale], onClick: ({ key }) => setLocale(key as Locale) }}
      placement="bottomRight"
    >
      <Tooltip title={t('lang.title')}>
        <Button type="text" icon={<GlobalOutlined />} />
      </Tooltip>
    </Dropdown>
  )
}
