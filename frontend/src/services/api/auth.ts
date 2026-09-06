/**
 * 账号认证 API（/api/auth/*，经 Vite 代理 /qbt-api 到 Go 后端）。
 *
 * 会话走 HttpOnly cookie（浏览器自动携带，代码不触碰令牌）；
 * login/setup 成功响应即携带 Set-Cookie。
 */

import { request } from '@/services/api/client'

/** auth/status 返回：是否需要初始化引导、当前是否已登录 */
export interface AuthStatus {
  setupRequired: boolean
  authenticated: boolean
  /** 仅 authenticated 时非空 */
  username: string
}

export const authApi = {
  /** 账号状态（公开接口，前端启动时探测） */
  status(): Promise<AuthStatus> {
    return request('/auth/status')
  },

  /** 初始化账号（仅未设置时可用），成功即登录 */
  setup(username: string, password: string): Promise<{ username: string }> {
    return request('/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },

  /** 登录 */
  login(username: string, password: string): Promise<{ username: string }> {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },

  /** 登出（清除本浏览器会话 cookie） */
  logout(): Promise<void> {
    return request('/auth/logout', { method: 'POST' })
  },

  /** 修改密码：验证当前密码；成功后其他会话失效、当前浏览器保持登录 */
  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return request('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    })
  },
}
