import { Button, Flex, Result, Spin } from 'antd'
import { type ReactNode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { onUnauthorized } from '@/services/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useAppStore } from '@/stores/appStore'

/**
 * 认证闸门：包住整个 RouterProvider。
 * - 启动时探测账号状态，决定进入初始化引导 / 登录页 / 主界面
 * - 任意受保护接口 401（client.ts 统一分发）时切回登录页，保留当前 URL
 * - 服务器列表的加载挂在「已登录」状态上：登录前不打注定 401 的接口，
 *   轮询（useTorrentPolling 以 servers 为清单）也随列表为空自然停摆
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const status = useAuthStore((s) => s.status)
  const bootstrap = useAuthStore((s) => s.bootstrap)
  const markUnauthenticated = useAuthStore((s) => s.markUnauthenticated)
  const loadServers = useAppStore((s) => s.loadServers)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    // 返回退订函数，AuthGate 卸载即应用卸载
    return onUnauthorized(markUnauthenticated)
  }, [markUnauthenticated])

  // 登录后加载服务器列表；登出（authStore.logout）时列表已被清空
  useEffect(() => {
    if (status === 'authenticated') void loadServers()
  }, [status, loadServers])

  if (status === 'loading') {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
        <Spin size="large" />
      </Flex>
    )
  }

  // 网络故障不误判为「未登录」：给出明确的重试入口
  if (status === 'error') {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
        <Result
          status="warning"
          title={t('auth.statusError')}
          extra={
            <Button type="primary" onClick={() => void bootstrap()}>
              {t('auth.retry')}
            </Button>
          }
        />
      </Flex>
    )
  }

  return <>{children}</>
}
