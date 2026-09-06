import { Navigate, useLocation } from 'react-router-dom'
import { type ReactNode } from 'react'

import { useAuthStore } from '@/stores/authStore'

/**
 * 主布局路由守卫（包裹 AppLayout）：
 * - 未初始化账号 → /setup（初始化引导）
 * - 未登录 → /login（记住来源路径，登录后跳回）
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status === 'setup') {
    return <Navigate to="/setup" replace />
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
