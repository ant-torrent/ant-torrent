import { useCallback, useEffect, useState } from 'react'
import { App, Button, Empty, Input, Space, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { qbtApi } from '@/services/api/client'
import { useActiveServerId } from '../ServerIdContext'

const { Text } = Typography

/** 标签管理：直接读写真实 qBittorrent（经 Go 后端转发） */
export default function TagsTab() {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const tt = (k: string) => t(`settings.qbt.tags.${k}`)
  const serverId = useActiveServerId()

  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTags(await qbtApi.getTags(serverId))
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

  /** 输入支持逗号分隔批量创建 */
  const handleCreate = async () => {
    const newTags = [...new Set(inputVal.split(',').map((s) => s.trim()).filter(Boolean))]
    if (newTags.length === 0) return
    setCreating(true)
    try {
      await qbtApi.createTags(serverId, newTags)
      message.success(t('common.saved'))
      setInputVal('')
      await load()
    } catch (err) {
      message.error(err instanceof Error ? err.message : tt('createFailed'))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (tag: string) => {
    try {
      await qbtApi.deleteTags(serverId, [tag])
      message.success(t('common.deleted'))
      await load()
    } catch (err) {
      message.error(err instanceof Error ? err.message : tt('deleteFailed'))
    }
  }

  // antd Tag 关闭图标点击会 stopPropagation，外层弹层收不到事件，
  // 删除确认统一在这里弹出
  const confirmDelete = (tag: string) => {
    modal.confirm({
      title: tt('deleteConfirm'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => handleDelete(tag),
    })
  }

  return (
    <>
      {/* 输入框单独一行 */}
      <Space.Compact style={{ width: 360, marginBottom: 16 }}>
        <Input
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onPressEnter={handleCreate}
          placeholder={tt('namePlaceholder')}
          maxLength={100}
        />
        <Button type="primary" icon={<PlusOutlined />} loading={creating} onClick={handleCreate}>
          {tt('create')}
        </Button>
      </Space.Compact>

      {/* 标签在下一行流式排列 */}
      <div>
        {loading ? (
          <Text type="secondary">...</Text>
        ) : tags.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tt('empty')} />
        ) : (
          <Space wrap size={[8, 12]}>
            {tags.map((tag) => (
              <Tag
                key={tag}
                color="geekblue"
                closable
                onClick={() => confirmDelete(tag)}
                onClose={(e) => {
                  // 阻止 antd 立即隐藏标签，删除由确认回调驱动
                  e.preventDefault()
                  confirmDelete(tag)
                }}
                style={{ cursor: 'pointer', fontSize: 13, padding: '2px 8px' }}
              >
                {tag}
              </Tag>
            ))}
          </Space>
        )}
      </div>
    </>
  )
}
