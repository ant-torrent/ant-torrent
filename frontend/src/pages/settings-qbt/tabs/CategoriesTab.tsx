import { useCallback, useEffect, useState } from 'react'
import { App, Button, Empty, Form, Input, Modal, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { qbtApi, type QbtCategory } from '@/services/api/client'
import { DirPathInput } from '@/components/DirPathInput'
import { useActiveServerId } from '../ServerIdContext'

const { Text } = Typography

interface CategoryFormValues {
  name: string
  savePath: string
}

/** 分类管理：直接读写真实 qBittorrent（经 Go 后端转发） */
export default function CategoriesTab() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const tt = (k: string) => t(`settings.qbt.categories.${k}`)
  const serverId = useActiveServerId()

  const [categories, setCategories] = useState<QbtCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<QbtCategory | null>(null)
  const [form] = Form.useForm<CategoryFormValues>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setCategories(await qbtApi.getCategories(serverId))
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (cat: QbtCategory) => {
    setEditing(cat)
    form.setFieldsValue({ name: cat.name, savePath: cat.savePath })
    setModalOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields().catch(() => null)
    if (!values) return
    setSaving(true)
    try {
      if (editing) {
        await qbtApi.editCategory(serverId, editing.name, values.savePath)
        message.success(t('common.saved'))
      } else {
        await qbtApi.createCategory(serverId, values.name.trim(), values.savePath.trim())
        message.success(t('common.saved'))
      }
      setModalOpen(false)
      await load()
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (cat: QbtCategory) => {
    try {
      await qbtApi.removeCategories(serverId, [cat.name])
      message.success(t('common.deleted'))
      await load()
    } catch (err) {
      message.error(err instanceof Error ? err.message : tt('removeFailed'))
    }
  }

  const columns = [
    {
      title: tt('name'),
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (name: string) => <Tag color="blue">{name}</Tag>,
    },
    {
      title: tt('savePath'),
      dataIndex: 'savePath',
      key: 'savePath',
      ellipsis: true,
      render: (path: string) => (path ? <Text copyable={{ text: path }}>{path}</Text> : <Text type="secondary">-</Text>),
    },
    {
      title: tt('actions'),
      key: 'actions',
      width: 140,
      render: (_: unknown, cat: QbtCategory) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(cat)}>
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={tt('removeConfirm')}
            description={tt('removeConfirmDesc')}
            okText={t('common.delete')}
            okButtonProps={{ danger: true }}
            cancelText={t('common.cancel')}
            onConfirm={() => handleRemove(cat)}
          >
            <Button type="link" size="small" danger>
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {tt('create')}
        </Button>
      </div>

      <Table<QbtCategory>
        rowKey="name"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={categories}
        pagination={false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tt('empty')} /> }}
      />

      <Modal
        title={editing ? tt('editTitle') : tt('createTitle')}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        forceRender
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item
            name="name"
            label={tt('name')}
            rules={[{ required: true, whitespace: true, message: tt('nameRequired') }]}
          >
            <Input placeholder={tt('namePlaceholder')} disabled={!!editing} />
          </Form.Item>
          <Form.Item name="savePath" label={tt('savePath')}>
            <DirPathInput serverId={serverId} placeholder={tt('savePathPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
