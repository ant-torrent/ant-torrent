import { App as AntApp, Flex, Spin } from 'antd'
import { Suspense, useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'

import i18n from '@/i18n'
import { router } from '@/router'
import AuthGate from '@/auth/AuthGate'
import { useTorrentPolling } from '@/hooks/useTorrentPolling'
import { useAppStore } from '@/stores/appStore'
import { ThemeProvider } from '@/theme/ThemeProvider'

function PageLoading() {
  return (
    <Flex align="center" justify="center" style={{ minHeight: '60vh' }}>
      <Spin size="large" />
    </Flex>
  )
}

function AppInner() {
  const locale = useAppStore((s) => s.locale)
  // 应用级轮询：持续刷新所有服务器快照写入 torrentStore。
  // 登录前服务器列表为空、轮询自然停摆；登录后由 AuthGate 加载列表启动轮询。
  useTorrentPolling()

  useEffect(() => {
    void i18n.changeLanguage(locale)
  }, [locale])

  return (
    <AuthGate>
      <Suspense fallback={<PageLoading />}>
        <RouterProvider router={router} />
      </Suspense>
    </AuthGate>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AntApp>
        <AppInner />
      </AntApp>
    </ThemeProvider>
  )
}
