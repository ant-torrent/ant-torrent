import { KeyOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Dropdown, Layout, Space, Tooltip, Typography, theme as antdTheme } from 'antd'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import LangSwitch from './LangSwitch'
import ThemeSwitch from './ThemeSwitch'

import { PAGE_TITLE_KEYS } from '@/router/paths'
import { useAuthStore } from '@/stores/authStore'

interface HeaderBarProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function HeaderBar({ collapsed, onToggleCollapse }: HeaderBarProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { token } = antdTheme.useToken()
  const username = useAuthStore((s) => s.username)
  const logout = useAuthStore((s) => s.logout)

  const titleKey = PAGE_TITLE_KEYS[location.pathname]

  return (
    <Layout.Header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        borderBottom: `1px solid ${token.colorSplit}`,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <Space size={12}>
        <Tooltip title={collapsed ? t('header.expand') : t('header.collapse')}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={onToggleCollapse}
          />
        </Tooltip>
        {titleKey && (
          <Typography.Title level={5} style={{ margin: 0 }}>
            {t(titleKey)}
          </Typography.Title>
        )}
      </Space>
      <Space size={16}>
        <LangSwitch />
        <ThemeSwitch />
        {/* 用户菜单：当前登录用户 + 修改密码（跳应用设置账号 tab）+ 退出登录 */}
        <Dropdown
          menu={{
            items: [
              {
                key: 'changePassword',
                icon: <KeyOutlined />,
                label: t('auth.changePassword'),
                onClick: () => navigate('/settings/app?tab=account'),
              },
              { type: 'divider' },
              {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: t('auth.logout'),
                onClick: () => void logout(),
              },
            ],
          }}
          placement="bottomRight"
        >
          <Space size={8} style={{ cursor: 'pointer' }}>
            <Avatar size="small" icon={<UserOutlined />} />
            {username && <Typography.Text>{username}</Typography.Text>}
          </Space>
        </Dropdown>
      </Space>
    </Layout.Header>
  )
}
