import { Card, Tabs, Form, Segmented, Select, Typography, Divider, Space } from 'antd'
import { SunOutlined, MoonOutlined, DesktopOutlined, GithubOutlined, BugOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useAppStore, type ThemeMode, type AccentKey, type Locale } from '@/stores/appStore'
import { ACCENTS } from '@/theme/tokens'
import { version as appVersion } from '../../../package.json'
import AiTab from './AiTab'
import AccountTab from './AccountTab'
import LogsTab from './LogsTab'

const { Text, Title, Link: TypoLink } = Typography

function AppearanceTab() {
  const { t } = useTranslation()
  const tt = (k: string) => t(`settings.app.appearance.${k}`)
  const { themeMode, accent, locale, setThemeMode, setAccent, setLocale } = useAppStore()

  const accentKeys = Object.keys(ACCENTS) as AccentKey[]

  // component={false}：只借 Form 提供布局上下文，不渲染真实 form 元素；
  // labelCol 固定 label 列宽使 labelAlign=right（默认）生效，与账号/AI tab 对齐
  return (
    <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }} component={false}>
      <Form.Item label={tt('themeMode')}>
        <Segmented
          value={themeMode}
          onChange={(val) => setThemeMode(val as ThemeMode)}
          options={[
            { label: <><SunOutlined /> {t('theme.light')}</>, value: 'light' },
            { label: <><DesktopOutlined /> {t('theme.system')}</>, value: 'system' },
            { label: <><MoonOutlined /> {t('theme.dark')}</>, value: 'dark' },
          ]}
        />
      </Form.Item>

      <Form.Item label={tt('accentColor')}>
        <Space size={12}>
          {accentKeys.map((key) => (
            <div
              key={key}
              onClick={() => setAccent(key)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: ACCENTS[key].color,
                cursor: 'pointer',
                border: accent === key ? '3px solid' : '3px solid transparent',
                borderColor: accent === key ? ACCENTS[key].color : 'transparent',
                boxShadow: accent === key ? `0 0 0 2px ${ACCENTS[key].color}40` : 'none',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={t(ACCENTS[key].labelKey)}
            >
              {accent === key && (
                <span style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>✓</span>
              )}
            </div>
          ))}
        </Space>
      </Form.Item>

      <Form.Item label={tt('language')}>
        <Select
          value={locale}
          onChange={(val) => setLocale(val as Locale)}
          style={{ width: 200 }}
          options={[
            { label: t('lang.zh-CN'), value: 'zh-CN' },
            { label: t('lang.en-US'), value: 'en-US' },
          ]}
        />
      </Form.Item>
    </Form>
  )
}

function AboutTab() {
  const { t } = useTranslation()
  const tt = (k: string) => t(`settings.app.about.${k}`)

  return (
    <>
      <Title level={4} style={{ marginBottom: 4 }}>{t('brand')}</Title>
      <Text type="secondary">v{appVersion}</Text>

      <Divider />

      <Text strong>{tt('links')}</Text>
      <div style={{ marginTop: 8 }}>
        <Space orientation="vertical" size={4}>
          <TypoLink href="https://github.com/ant-torrent/ant-torrent" target="_blank">
            <GithubOutlined /> {tt('github')}
          </TypoLink>
          <TypoLink href="https://github.com/ant-torrent/ant-torrent/issues" target="_blank">
            <BugOutlined /> {tt('issues')}
          </TypoLink>
        </Space>
      </div>

      <Divider />
      <Text type="secondary">{tt('copyright')}</Text>
    </>
  )
}

/** 合法 tab key（同时用于 ?tab= 深链校验，如头像菜单跳 ?tab=account 改密码） */
const TAB_KEYS = ['appearance', 'ai', 'account', 'logs', 'about']

export default function AppSettingsPage() {
  const { t } = useTranslation()
  // tab 由 URL 驱动：支持外部深链直达，切换时 replace 回写不产生历史记录
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeKey = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : TAB_KEYS[0]

  // 表单类 tab 内容限宽保证可读性；日志 tab 占满整行（见 LogsTab）。
  // 限宽放各自 children 而非 Tabs 容器，日志页才能 100% 宽
  const formBox = { maxWidth: 800 }
  const tabItems = [
    { key: 'appearance', label: t('settings.app.tabs.appearance'), children: <div style={formBox}><AppearanceTab /></div> },
    { key: 'ai', label: t('settings.app.tabs.ai'), children: <div style={formBox}><AiTab /></div> },
    { key: 'account', label: t('settings.app.tabs.account'), children: <div style={formBox}><AccountTab /></div> },
    { key: 'logs', label: t('settings.app.tabs.logs'), children: <LogsTab /> },
    { key: 'about', label: t('settings.app.tabs.about'), children: <div style={formBox}><AboutTab /></div> },
  ]

  return (
    <Card title={t('settings.app.title')}>
      <Tabs
        tabPlacement="top"
        items={tabItems}
        activeKey={activeKey}
        onChange={(key) => setSearchParams({ tab: key }, { replace: true })}
      />
    </Card>
  )
}
