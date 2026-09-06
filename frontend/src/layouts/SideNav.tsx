import {
  ControlOutlined,
  DashboardOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons'
import { Layout, Menu, theme as antdTheme } from 'antd'
import type { MenuProps } from 'antd'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import { RssIcon } from '@/components/RssIcon'
import { QbIcon } from '@/components/QbIcon'
import { TrIcon } from '@/components/TrIcon'

interface SideNavProps {
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
}

export default function SideNav({ collapsed, onCollapse }: SideNavProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = antdTheme.useToken()

  const items: MenuProps['items'] = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: t('nav.dashboard') },
    { key: '/torrents', icon: <FolderOpenOutlined />, label: t('nav.torrents') },
    { key: '/rss', icon: <RssIcon />, label: t('nav.rss') },
    // 应用自身设置在前；各下载器设置独立入口（后续 rTorrent 等依次追加）
    { key: '/settings/app', icon: <ControlOutlined />, label: t('nav.appSettings') },
    { key: '/settings/qbittorrent', icon: <QbIcon />, label: t('nav.qbtSettings') },
    { key: '/settings/transmission', icon: <TrIcon />, label: t('nav.transmissionSettings') },
  ]

  return (
    <Layout.Sider
      collapsible
      breakpoint="lg"
      collapsed={collapsed}
      onCollapse={onCollapse}
      width={216}
      collapsedWidth={64}
      trigger={null}
      style={{
        borderRight: `1px solid ${token.colorSplit}`,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 10,
          padding: collapsed ? 0 : '0 16px',
          borderBottom: `1px solid ${token.colorSplit}`,
        }}
      >
        <img src="/favicon.svg" alt="AntTorrent" style={{ width: 26, height: 26 }} />
        {!collapsed && (
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0.2 }}>
            <span style={{ color: token.colorPrimary }}>Ant</span>Torrent
          </span>
        )}
      </div>
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={items}
        onClick={({ key }) => navigate(key)}
        style={{ border: 'none', padding: '8px 0' }}
      />
    </Layout.Sider>
  )
}
