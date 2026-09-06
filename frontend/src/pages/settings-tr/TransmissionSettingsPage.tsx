import { useEffect, useState } from 'react'
import { App, Button, Card, Form, Input, Menu, Modal, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'
import { downloaderType } from '@/services/downloaders'
import type { ServerConfig } from '@/services/api/client'
import { TransmissionSettingsPanel } from './SessionSettingsTab'
import '../settings-qbt/QbtSettingsPage.css'

const { Text } = Typography

interface AddFormValues {
  name?: string
  url?: string
  username?: string
  password?: string
}

export default function TransmissionSettingsPage() {
  const { t } = useTranslation()
  const { modal, message } = App.useApp()
  const servers = useAppStore((s) => s.servers)
  const activeServerId = useAppStore((s) => s.activeServerId)
  const setActiveServerId = useAppStore((s) => s.setActiveServerId)
  const addServer = useAppStore((s) => s.addServer)
  const removeServer = useAppStore((s) => s.removeServer)

  const trServers = servers.filter((s) => downloaderType(s.type) === 'transmission')

  useEffect(() => {
    const inPage = trServers.some((s) => s.id === activeServerId)
    if (!inPage && trServers.length > 0) {
      setActiveServerId(trServers[0]!.id)
    }
  }, [activeServerId, trServers, setActiveServerId])

  const [addOpen, setAddOpen] = useState(false)
  const [addForm] = Form.useForm<AddFormValues>()

  const handleAddServer = () => setAddOpen(true)

  const handleAddSubmit = async () => {
    const values = await addForm.validateFields()
    const name = values.name?.trim() || `Transmission ${trServers.length + 1}`
    const url = values.url?.trim() || 'http://localhost:9091'
    const id = await addServer({
      name,
      url,
      username: values.username?.trim() ?? '',
      password: values.password ?? '',
      type: 'transmission',
    })
    if (!id) {
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
      onOk: async () => {
        await removeServer(srv.id)
      },
    })
  }

  const active = trServers.find((s) => s.id === activeServerId)

  return (
    <Card title={t('settings.transmission.title')}>
      <div style={{ display: 'flex', gap: 30, alignItems: 'flex-start' }}>
        {/* 左侧服务器列表 */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            {t('settings.qbt.serverList')}
          </Text>
          <Menu
            mode="inline"
            selectedKeys={active ? [active.id] : []}
            items={trServers.map((srv) => ({
              key: srv.id,
              label: (
                <span className="server-menu-item">
                  <span className="server-menu-name">{srv.name}</span>
                  <DeleteOutlined
                    className="server-delete-icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveServer(srv)
                    }}
                  />
                </span>
              ),
            }))}
            onClick={({ key }) => setActiveServerId(key)}
            style={{ width: 200, marginBottom: 8 }}
          />
          <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddServer} block>
            {t('settings.transmission.addServer')}
          </Button>
          <Modal
            title={t('settings.transmission.addServer')}
            open={addOpen}
            onOk={() => void handleAddSubmit()}
            onCancel={() => setAddOpen(false)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            destroyOnHidden
          >
            <Form form={addForm} layout="vertical">
              <Form.Item name="name" label={t('server.name')}>
                <Input placeholder={t('server.namePlaceholder')} />
              </Form.Item>
              <Form.Item name="url" label={t('server.url')}>
                <Input placeholder={t('server.urlPlaceholderTransmission')} />
              </Form.Item>
              <Form.Item name="username" label={t('server.username')}>
                <Input placeholder={t('server.usernameOptionalPlaceholder')} />
              </Form.Item>
              <Form.Item name="password" label={t('server.password')}>
                <Input.Password placeholder={t('server.passwordPlaceholder')} />
              </Form.Item>
            </Form>
          </Modal>
        </div>

        {/* 右侧配置区 */}
        {active ? (
          <TransmissionSettingsPanel key={active.id} server={active} />
        ) : (
          <div style={{ flex: 1, textAlign: 'center', padding: 40 }}>
            <Text type="secondary">{t('settings.qbt.noServer')}</Text>
          </div>
        )}
      </div>
    </Card>
  )
}
