import { useMemo, useState } from 'react'
import { App, Button, Input, Modal, Space, Table, Typography } from 'antd'
import type { TableProps } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { torrentsApi } from '@/services/api/client'
import { refreshServer } from '@/hooks/useTorrentPolling'
import type { Torrent, Tracker } from '@/services/types'

const { Text } = Typography

/** qB 内建节点（** [DHT] ** 等），非真实 Tracker，不可管理 */
const isBuiltin = (url: string) => url.startsWith('**')

interface Props {
  torrent: Torrent
  trackers: Tracker[]
  /** 增删改后由抽屉重新拉取 Tracker 列表 */
  onReload: () => Promise<void> | void
  /** 只读（Transmission 无逐 tracker 增删改，仅展示） */
  readOnly?: boolean
}

/** 种子详情抽屉 · Tracker 列表（qB 含 添加 / 编辑 / 移除 管理，与 qB WebUI 行为一致） */
export function TrackersTab({ torrent, trackers, onReload, readOnly = false }: Props) {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()

  const [selectedUrls, setSelectedUrls] = useState<React.Key[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  // 添加：多行 URL 文本；编辑：新地址
  const [urlsText, setUrlsText] = useState('')
  const [editVal, setEditVal] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const selectedSet = useMemo(() => new Set(selectedUrls as string[]), [selectedUrls])
  // 编辑仅支持单选（qB editTracker 一次只能改一条）
  const editTarget = selectedUrls.length === 1 ? trackers.find((tr) => tr.url === selectedUrls[0]) : undefined

  /** 执行 → 成功提示 + 重载列表；列表页的 Tracker 域名筛选依赖种子数据，一并刷新 */
  const run = async (action: () => Promise<unknown>, okMsg: string) => {
    setSubmitting(true)
    try {
      await action()
      message.success(okMsg)
      setSelectedUrls([])
      await onReload()
      void refreshServer(torrent.server_id)
      return true
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  const openAdd = () => {
    setUrlsText('')
    setAddOpen(true)
  }

  const openEdit = () => {
    if (editTarget) {
      setEditVal(editTarget.url)
      setEditOpen(true)
    }
  }

  const submitAdd = async () => {
    const urls = urlsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (urls.length === 0) {
      message.warning(t('torrents.trackers.addRequired'))
      return
    }
    const ok = await run(
      () => torrentsApi.addTrackers(torrent.server_id, torrent.hash, urls),
      t('torrents.trackers.added', { count: urls.length }),
    )
    if (ok) setAddOpen(false)
  }

  const submitEdit = async () => {
    const url = editVal.trim()
    if (!editTarget) return
    if (!url) {
      message.warning(t('torrents.trackers.editRequired'))
      return
    }
    if (url === editTarget.url) {
      setEditOpen(false)
      return
    }
    const ok = await run(
      () => torrentsApi.editTracker(torrent.server_id, torrent.hash, editTarget.url, url),
      t('torrents.trackers.updated'),
    )
    if (ok) setEditOpen(false)
  }

  const confirmRemove = () => {
    const urls = trackers.filter((tr) => selectedSet.has(tr.url)).map((tr) => tr.url)
    if (urls.length === 0) return
    modal.confirm({
      title: t('torrents.trackers.removeConfirm', { count: urls.length }),
      okButtonProps: { danger: true },
      onOk: () =>
        run(
          () => torrentsApi.removeTrackers(torrent.server_id, torrent.hash, urls),
          t('torrents.trackers.removed', { count: urls.length }),
        ),
    })
  }

  const rowSelection: TableProps<Tracker>['rowSelection'] = {
    selectedRowKeys: selectedUrls,
    onChange: setSelectedUrls,
    // DHT/PeX/LSD 内建节点不可增删改
    getCheckboxProps: (tr: Tracker) => ({ disabled: isBuiltin(tr.url) }),
    columnWidth: 40,
  }

  return (
    <>
      {!readOnly && (
        <Space style={{ marginBottom: 12 }}>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            {t('torrents.trackers.add')}
          </Button>
          <Button size="small" icon={<EditOutlined />} disabled={selectedUrls.length !== 1} onClick={openEdit}>
            {t('torrents.trackers.edit')}
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} disabled={selectedUrls.length === 0} onClick={confirmRemove}>
            {t('torrents.trackers.remove')}
          </Button>
        </Space>
      )}

      <Table
        dataSource={trackers}
        rowKey="url"
        size="small"
        pagination={false}
        rowSelection={readOnly ? undefined : rowSelection}
        columns={[
          { title: 'URL', dataIndex: 'url', key: 'url', ellipsis: true },
          { title: 'Tier', dataIndex: 'tier', key: 'tier', width: 80 },
          { title: t('torrents.col.status'), dataIndex: 'status', key: 'status', width: 80, render: (s: number) => (s === 2 ? '✓' : '✗') },
          { title: t('torrents.col.seeds'), dataIndex: 'seeds', key: 'seeds', width: 80 },
          { title: t('torrents.col.leechs'), dataIndex: 'leeches', key: 'leeches', width: 80 },
        ]}
      />

      {/* 添加：每行一个 announce URL */}
      <Modal
        open={addOpen}
        title={t('torrents.trackers.addTitle')}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={submitting}
        onOk={() => void submitAdd()}
        onCancel={() => setAddOpen(false)}
        destroyOnHidden
      >
        <Input.TextArea
          autoFocus
          rows={4}
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder={t('torrents.trackers.addPh')}
        />
      </Modal>

      {/* 编辑：仅单选，预填当前地址 */}
      <Modal
        open={editOpen}
        title={t('torrents.trackers.editTitle')}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={submitting}
        onOk={() => void submitEdit()}
        onCancel={() => setEditOpen(false)}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Text type="secondary" style={{ wordBreak: 'break-all' }}>
            {editTarget?.url}
          </Text>
          <Input
            autoFocus
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            placeholder="http://tracker.example.com/announce"
            onPressEnter={() => void submitEdit()}
          />
        </Space>
      </Modal>
    </>
  )
}
