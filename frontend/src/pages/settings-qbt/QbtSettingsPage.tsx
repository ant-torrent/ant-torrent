import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Card, Form, Tabs, Button, Space, Spin, App, Menu, Typography, Input, Modal } from 'antd'
import { SaveOutlined, UndoOutlined, PlusOutlined, DeleteOutlined, CloudServerOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { usePreferencesForm } from '@/hooks/usePreferencesForm'
import { useAppStore } from '@/stores/appStore'
import ServerConnectionTab from './tabs/ServerConnectionTab'
import BehaviorTab from './tabs/BehaviorTab'
import DownloadsTab from './tabs/DownloadsTab'
import CategoriesTab from './tabs/CategoriesTab'
import TagsTab from './tabs/TagsTab'
import SpeedTab from './tabs/SpeedTab'
import BitTorrentTab from './tabs/BitTorrentTab'
import WebUiTab from './tabs/WebUiTab'
import AdvancedTab from './tabs/AdvancedTab'
import type { AppPreferences } from '@/services/types'
import type { ServerConfig } from '@/services/api/client'
import { downloaderType } from '@/services/downloaders'
import { ServerIdProvider } from './ServerIdContext'
import './QbtSettingsPage.css'

const { Text } = Typography

/** 各偏好 tab 拥有的表单字段：保存/重置只作用于当前 tab。
 *  schedule_* 四个字段由时间范围控件桥接（无独立 Form.Item），需显式列出 */
const TAB_FIELDS: Record<string, (keyof AppPreferences)[]> = {
  behavior: [
    'add_stopped_enabled', 'confirm_torrent_deletion', 'confirm_torrent_recheck',
    'auto_delete_mode', 'preallocate_all', 'incomplete_files_ext',
    'use_category_paths_in_manual_mode', 'save_path_changed_tmm_enabled', 'category_changed_tmm_enabled',
    'torrent_changed_tmm_enabled', 'autorun_enabled', 'autorun_on_torrent_added_enabled', 'autorun_program',
  ],
  downloads: [
    'save_path', 'temp_path_enabled', 'temp_path', 'scan_dirs', 'export_dir', 'export_dir_fin',
    'mail_notification_enabled', 'mail_notification_auth_enabled', 'mail_notification_ssl_enabled',
    'mail_notification_smtp', 'mail_notification_email', 'mail_notification_username', 'mail_notification_password',
  ],
  speed: [
    'dl_limit', 'up_limit', 'alt_dl_limit', 'alt_up_limit', 'scheduler_enabled',
    'schedule_from_hour', 'schedule_from_min', 'schedule_to_hour', 'schedule_to_min',
    'scheduler_days', 'limit_utp_rate', 'limit_tcp_overhead', 'limit_lan_peers',
  ],
  bittorrent: [
    'encryption', 'anonymous_mode', 'dht', 'pex', 'lsd', 'bittorrent_protocol', 'add_trackers_enabled',
    'add_trackers', 'queueing_enabled', 'max_active_downloads', 'max_active_uploads', 'max_active_torrents',
    'dont_count_slow_torrents', 'slow_torrent_dl_rate_threshold', 'slow_torrent_ul_rate_threshold',
    'slow_torrent_inactive_timer', 'max_ratio_enabled', 'max_ratio', 'max_ratio_act',
    'max_seeding_time_enabled', 'max_seeding_time',
  ],
  webui: [
    'web_ui_address', 'web_ui_port', 'web_ui_upnp', 'web_ui_domain_list', 'web_ui_host_header_validation_enabled',
    'web_ui_clickjacking_protection_enabled', 'web_ui_csrf_protection_enabled', 'web_ui_secure_cookie_enabled',
    'web_ui_max_auth_fail_count', 'web_ui_ban_duration', 'web_ui_session_timeout', 'web_ui_username', 'web_ui_password',
    'bypass_local_auth', 'bypass_auth_subnet_whitelist_enabled', 'bypass_auth_subnet_whitelist',
    'alternative_webui_enabled', 'alternative_webui_path', 'web_ui_https_enabled', 'web_ui_https_cert_path',
    'web_ui_https_key_path', 'web_ui_use_custom_http_headers_enabled', 'web_ui_custom_http_headers',
  ],
  advanced: [
    'refresh_interval', 'resolve_peer_countries', 'reannounce_when_address_changed', 'announce_ip',
    'enable_multi_connections_from_same_ip', 'validate_https_tracker_certificate', 'ssrf_mitigation',
    'socket_backlog', 'outgoing_ports_min', 'outgoing_ports_max', 'upnp_lease_duration',
    'utp_tcp_mixed_mode', 'upload_slots_behavior', 'upload_choking_algorithm', 'send_buffer_watermark',
    'send_buffer_low_watermark', 'send_buffer_watermark_factor', 'async_io_threads',
    'hashing_threads', 'disk_cache_size', 'disk_io_read_mode', 'disk_io_write_mode', 'disk_queue_size',
    'enable_os_cache', 'embedded_tracker_port', 'embedded_tracker_port_forwarding', 'enable_embedded_tracker',
    'stop_tracker_timeout', 'max_concurrent_http_announces', 'recheck_torrents_on_completion',
  ],
}

/** 服务器偏好设置面板（选中某台服务器后显示） */
function ServerSettingsPanel({ server }: { server: ServerConfig }) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [form] = Form.useForm<AppPreferences>()
  const serverId = server.id
  const { loading, saving, preferences, loadPreferences, savePreferences, resetPreferences } = usePreferencesForm(serverId)

  useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

  useEffect(() => {
    form.setFieldsValue(preferences)
  }, [preferences, form])

  /** 保存：仅校验并提交当前 tab 的字段，不影响其他 tab 未保存的修改 */
  const handleSave = async (tabKey: string) => {
    const fields = TAB_FIELDS[tabKey]
    if (!fields) return
    try {
      await form.validateFields(fields)
      const success = await savePreferences(form.getFieldsValue(fields))
      if (success) {
        message.success(t('common.saved'))
      }
    } catch {
      message.error(t('common.saveFailed'))
    }
  }

  /** 重置：仅还原当前 tab 的字段到上次加载的值 */
  const handleReset = (tabKey: string) => {
    if (!TAB_FIELDS[tabKey]) return
    resetPreferences(form, TAB_FIELDS[tabKey])
  }

  // 每个 tab 内容限宽，避免宽屏下表单被拉满；actionKey 的 tab 底部带 保存/重置
  const tabContent = (node: ReactNode, actionKey?: string) => (
    <div style={{ maxWidth: 720, paddingTop: 16 }}>
      {node}
      {actionKey && (
        <Form.Item label=" " colon={false}>
          <Space>
            <Button icon={<UndoOutlined />} onClick={() => handleReset(actionKey)} disabled={loading}>
              {t('common.reset')}
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={() => handleSave(actionKey)}
              loading={saving}
              disabled={loading}
            >
              {t('common.save')}
            </Button>
          </Space>
        </Form.Item>
      )}
    </div>
  )

  const tabItems = [
    { key: 'connection_config', label: t('settings.qbt.tabs.connectionConfig'), children: tabContent(<ServerConnectionTab serverId={serverId} />), forceRender: true },
    { key: 'behavior', label: t('settings.qbt.tabs.behavior'), children: tabContent(<BehaviorTab />, 'behavior'), forceRender: true },
    { key: 'downloads', label: t('settings.qbt.tabs.downloads'), children: tabContent(<DownloadsTab />, 'downloads'), forceRender: true },
    { key: 'speed', label: t('settings.qbt.tabs.speed'), children: tabContent(<SpeedTab />, 'speed'), forceRender: true },
    { key: 'bittorrent', label: t('settings.qbt.tabs.bittorrent'), children: tabContent(<BitTorrentTab />, 'bittorrent'), forceRender: true },
    { key: 'webui', label: t('settings.qbt.tabs.webui'), children: tabContent(<WebUiTab />, 'webui'), forceRender: true },
    { key: 'advanced', label: t('settings.qbt.tabs.advanced'), children: tabContent(<AdvancedTab />, 'advanced'), forceRender: true },
    { key: 'categories', label: t('settings.qbt.tabs.categories'), children: tabContent(<CategoriesTab />) },
    { key: 'tags', label: t('settings.qbt.tabs.tags'), children: tabContent(<TagsTab />) },
  ]

  return (
    <ServerIdProvider value={serverId}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Spin spinning={loading}>
          <Form
            form={form}
            layout="horizontal"
            labelCol={{ flex: '0 0 220px' }}
            wrapperCol={{ flex: 'auto' }}
            labelWrap
            initialValues={preferences}
          >
            <Tabs items={tabItems} />
          </Form>
        </Spin>
      </div>
    </ServerIdProvider>
  )
}

export default function QbtSettingsPage() {
  const { t } = useTranslation()
  const { modal, message } = App.useApp()
  const servers = useAppStore((s) => s.servers)
  const activeServerId = useAppStore((s) => s.activeServerId)
  const setActiveServerId = useAppStore((s) => s.setActiveServerId)
  const addServer = useAppStore((s) => s.addServer)
  const removeServer = useAppStore((s) => s.removeServer)

  // 本页只管理 qBittorrent 服务器（Transmission 有独立页面 /settings/transmission）
  const qbServers = servers.filter((s) => downloaderType(s.type) === 'qbittorrent')

  // 默认选中第一台；当前选中服务器不属于本页（如为 tr）时切到本页第一台
  useEffect(() => {
    const inPage = qbServers.some((s) => s.id === activeServerId)
    if (!inPage && qbServers.length > 0) {
      setActiveServerId(qbServers[0]!.id)
    }
  }, [activeServerId, qbServers, setActiveServerId])

  const [addOpen, setAddOpen] = useState(false)
  const [addForm] = Form.useForm<{ name?: string; url?: string; username?: string; password?: string }>()

  const handleAddServer = () => {
    setAddOpen(true)
  }

  const handleAddSubmit = async () => {
    const values = await addForm.validateFields()
    const name = values.name?.trim() || `Server ${servers.length + 1}`
    const url = values.url?.trim() || 'http://localhost:8080'
    const id = await addServer({
      name,
      url,
      username: values.username?.trim() || 'admin',
      password: values.password ?? '',
      type: 'qbittorrent',
    })
    if (!id) {
      // 创建失败：提示后端错误并保持弹窗打开，允许修改后重试
      message.error(useAppStore.getState().serversError || t('common.saveFailed'))
      throw new Error('create server failed')
    }
    setAddOpen(false)
    addForm.resetFields()
    setActiveServerId(id)
  }

  const handleRemoveServer = (srv: ServerConfig) => {
    modal.confirm({
      title: t('settings.qbt.removeServer'),
      content: t('settings.qbt.removeServerConfirm', { name: srv.name }),
      okType: 'danger',
      onOk: async () => { await removeServer(srv.id) },
    })
  }

  // 允许删除到 0 台：无服务器时各页面会展示"前往设置"空状态引导
  const canRemove = servers.length > 0

  const menuItems = qbServers.map((srv) => ({
    key: srv.id,
    label: (
      <span className="server-menu-item">
        <span className="server-menu-name">
          <CloudServerOutlined />
          {srv.name}
        </span>
        {canRemove && (
          <DeleteOutlined
            className="server-delete-icon"
            onClick={(e) => {
              // 阻止冒泡，避免触发菜单项选中
              e.stopPropagation()
              handleRemoveServer(srv)
            }}
          />
        )}
      </span>
    ),
  }))

  return (
    <Card title={t('settings.qbt.title')}>
      <div style={{ display: 'flex', gap: 30, alignItems: 'flex-start' }}>
        {/* 左侧服务器列表 */}
        <div style={{ width: 200, flexShrink: 0}}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            {t('settings.qbt.serverList')}
          </Text>
          <Menu
            mode="inline"
            selectedKeys={activeServerId ? [activeServerId] : []}
            items={menuItems}
            onClick={({ key }) => setActiveServerId(key)}
            style={{ width: 200, marginBottom: 8 }}
          />
          <Button type={'dashed'} icon={<PlusOutlined />} onClick={handleAddServer} block>
            {t('settings.qbt.addServer')}
          </Button>
          <Modal
            title={t('settings.qbt.addServer')}
            open={addOpen}
            onOk={() => void handleAddSubmit()}
            onCancel={() => setAddOpen(false)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            destroyOnHidden
          >
            {/* 本页只添加 qBittorrent 服务器（类型在 addServer 中写死）；tr 走独立设置页，与 tr 页添加弹窗对称 */}
            <Form form={addForm} layout="vertical">
              <Form.Item name="name" label={t('server.name')}>
                <Input placeholder={t('server.namePlaceholder')} />
              </Form.Item>
              <Form.Item name="url" label={t('server.url')}>
                <Input
                  placeholder={
                    t('server.urlPlaceholder')
                  }
                />
              </Form.Item>
              <Form.Item name="username" label={t('server.username')}>
                <Input
                  placeholder={
                    t('server.usernamePlaceholder')
                  }
                />
              </Form.Item>
              <Form.Item name="password" label={t('server.password')}>
                <Input.Password placeholder={t('server.passwordPlaceholder')} />
              </Form.Item>
            </Form>
          </Modal>
        </div>

        {/* 右侧配置区 */}
        {(() => {
          const active = qbServers.find((s) => s.id === activeServerId)
          if (!active) {
            return (
              <div style={{ flex: 1, textAlign: 'center', padding: 40 }}>
                <Text type="secondary">{t('settings.qbt.noServer')}</Text>
              </div>
            )
          }
          return <ServerSettingsPanel key={active.id} server={active} />
        })()}
      </div>
    </Card>
  )
}
