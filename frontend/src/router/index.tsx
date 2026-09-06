import { lazy } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'

import AppLayout from '@/layouts/AppLayout'
import RequireAuth from '@/auth/RequireAuth'

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const TorrentsPage = lazy(() => import('@/pages/torrents/TorrentsPage'))
const RssPage = lazy(() => import('@/pages/rss/RssPage'))
const QbtSettingsPage = lazy(() => import('@/pages/settings-qbt/QbtSettingsPage'))
const TransmissionSettingsPage = lazy(() => import('@/pages/settings-tr/TransmissionSettingsPage'))
const AppSettingsPage = lazy(() => import('@/pages/settings-app/AppSettingsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const LoginPage = lazy(() => import('@/pages/login/LoginPage'))
const SetupPage = lazy(() => import('@/pages/setup/SetupPage'))

export const router = createBrowserRouter([
  // 认证相关页面：顶层平级路由，不套 AppLayout（无侧栏/顶栏）
  { path: '/login', element: <LoginPage /> },
  { path: '/setup', element: <SetupPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'torrents', element: <TorrentsPage /> },
      { path: 'rss', element: <RssPage /> },
      { path: 'settings/qbittorrent', element: <QbtSettingsPage /> },
      { path: 'settings/transmission', element: <TransmissionSettingsPage /> },
      { path: 'settings/app', element: <AppSettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
