import { Layout } from 'antd'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import HeaderBar from './HeaderBar'
import SideNav from './SideNav'
import AssistantFab from '@/assistant/AssistantFab'

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <SideNav collapsed={collapsed} onCollapse={setCollapsed} />
      <Layout style={{ minWidth: 0 }}>
        <HeaderBar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
        <Layout.Content
          style={{
            padding: 20,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Outlet />
        </Layout.Content>
      </Layout>
      <AssistantFab />
    </Layout>
  )
}
