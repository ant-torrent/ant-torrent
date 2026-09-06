import { useCallback, useEffect, useState } from 'react'
import { Drawer, Tabs, Descriptions, Tag, Table, Button, App, Typography } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { torrentOps } from '@/services/api/torrentOps'
import { supports } from '@/services/downloaders'
import { useAppStore } from '@/stores/appStore'
import type { Torrent, TorrentDetail } from '@/services/types'
import { formatBytes, formatSpeed, formatRatio, formatDateTime } from '@/utils/format'
import { copyText } from '@/utils/misc'
import { STATUS_COLOR_OF } from '@/services/status'
import { TrackersTab } from './TrackersTab'

interface Props {
  torrent: Torrent | null
  onClose: () => void
}

export default function TorrentDetailDrawer({ torrent, onClose }: Props) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const server = useAppStore((s) => s.servers.find((x) => x.id === torrent?.server_id))
  // tr 仅有整表 tracker_list 替换（后续迭代），详情面板对 tr 只读
  const trackersEditable = supports(server, 'trackersEdit')

  const [detail, setDetail] = useState<TorrentDetail | null>(null)
  const [loading, setLoading] = useState(false)

  const reloadDetail = useCallback(async () => {
    if (!torrent) return null
    return torrentOps(server ?? { id: torrent.server_id, name: '', type: 'qbittorrent', url: '', username: '', password: '' }).getDetail(torrent.hash)
  }, [server, torrent])

  useEffect(() => {
    if (!torrent) {
      setDetail(null)
      return
    }

    let cancelled = false
    setLoading(true)
    reloadDetail()
      .then((d) => {
        if (cancelled) return
        if (!d) {
          message.error(t('common.loadFailed'))
          return
        }
        setDetail({ torrent, trackers: d.trackers, files: d.files, peers: d.peers, comment: d.comment, created_by: d.created_by, creation_date: d.creation_date, seeding_time: d.seeding_time, nb_connections: d.nb_connections })
      })
      .catch((err) => {
        if (!cancelled) message.error(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [torrent, reloadDetail, message, t])

  const reloadTrackers = useCallback(async () => {
    if (!torrent || !server) return
    const trackers = await torrentOps(server).getTrackers?.(torrent.hash).catch(() => null)
    if (trackers) setDetail((d) => (d ? { ...d, trackers } : d))
  }, [torrent, server])

  const handleCopy = async (text: string, label: string) => {
    if (await copyText(text)) {
      message.success(`${t('common.copied')} ${label}`)
    } else {
      message.error(t('common.copyFailed'))
    }
  }

  if (!torrent) return null

  const overview = (
    <Descriptions column={1} bordered size="small">
      <Descriptions.Item label={t('torrents.detail.hash')}>
        <Typography.Text code copyable={{ text: torrent.hash }}>
          {torrent.hash}
        </Typography.Text>
      </Descriptions.Item>
      <Descriptions.Item label={t('torrents.col.status')}>
        <Tag color={STATUS_COLOR_OF[torrent.state]}>{t(`status.${torrent.state}`)}</Tag>
      </Descriptions.Item>
      <Descriptions.Item label={t('torrents.col.size')}>{formatBytes(torrent.size)}</Descriptions.Item>
      <Descriptions.Item label={t('torrents.col.dlspeed')}>{formatSpeed(torrent.dlspeed)}</Descriptions.Item>
      <Descriptions.Item label={t('torrents.col.upspeed')}>{formatSpeed(torrent.upspeed)}</Descriptions.Item>
      <Descriptions.Item label={t('torrents.col.ratio')}>{formatRatio(torrent.ratio)}</Descriptions.Item>
      <Descriptions.Item label={t('torrents.col.addedOn')}>{formatDateTime(torrent.added_on)}</Descriptions.Item>
      <Descriptions.Item label={t('torrents.col.completionOn')}>
        {torrent.completion_on > 0 ? formatDateTime(torrent.completion_on) : '-'}
      </Descriptions.Item>
      <Descriptions.Item label={t('torrents.detail.savePath')}>{torrent.save_path}</Descriptions.Item>
      <Descriptions.Item label={t('torrents.detail.magnet')}>
        <Button
          type="link"
          size="small"
          icon={<CopyOutlined />}
          onClick={() => handleCopy(torrent.magnet_uri, t('torrents.detail.magnet'))}
        >
          {t('torrents.detail.copyMagnet')}
        </Button>
      </Descriptions.Item>
      {detail?.comment && <Descriptions.Item label={t('torrents.detail.comment')}>{detail.comment}</Descriptions.Item>}
      {detail?.created_by && <Descriptions.Item label={t('torrents.detail.createdBy')}>{detail.created_by}</Descriptions.Item>}
    </Descriptions>
  )

  const trackers = (
    <TrackersTab
      torrent={torrent}
      trackers={detail?.trackers ?? []}
      onReload={reloadTrackers}
      readOnly={!trackersEditable}
    />
  )

  const files = detail?.files ? (
    <Table
      dataSource={detail.files}
      rowKey="name"
      size="small"
      pagination={false}
      columns={[
        {
          title: t('torrents.col.name'),
          dataIndex: 'name',
          key: 'name',
          // 文件名多为无空格的长场景名，按字符断行完整展示而非省略号截断
          onCell: () => ({ style: { wordBreak: 'break-all', whiteSpace: 'normal' } }),
        },
        { title: t('torrents.col.size'), dataIndex: 'size', key: 'size', width: 120, render: (s: number) => formatBytes(s) },
        {
          title: t('torrents.col.progress'),
          dataIndex: 'progress',
          key: 'progress',
          width: 120,
          render: (p: number) => `${(p * 100).toFixed(1)}%`,
        },
      ]}
    />
  ) : null

  const peers = detail?.peers ? (
    <Table
      dataSource={detail.peers}
      rowKey={(p) => `${p.ip}:${p.port}`}
      size="small"
      pagination={false}
      columns={[
        { title: 'IP', dataIndex: 'ip', key: 'ip' },
        { title: 'Port', dataIndex: 'port', key: 'port', width: 80 },
        { title: 'Client', dataIndex: 'client', key: 'client' },
        { title: t('torrents.col.dlspeed'), dataIndex: 'dl_speed', key: 'dl_speed', width: 120, render: (s: number) => formatSpeed(s) },
        { title: t('torrents.col.upspeed'), dataIndex: 'up_speed', key: 'up_speed', width: 120, render: (s: number) => formatSpeed(s) },
      ]}
    />
  ) : null

  return (
    <Drawer
      title={torrent.name}
      open={!!torrent}
      placement="right"
      size={720}
      onClose={onClose}
      loading={loading}
      destroyOnHidden
    >
      <Tabs
        items={[
          { key: 'overview', label: t('torrents.drawer.overview'), children: overview },
          { key: 'trackers', label: `${t('torrents.drawer.trackers')} (${detail?.trackers.length ?? 0})`, children: trackers },
          { key: 'files', label: `${t('torrents.drawer.files')} (${detail?.files.length ?? 0})`, children: files },
          { key: 'peers', label: `${t('torrents.drawer.peers')} (${detail?.peers.length ?? 0})`, children: peers },
        ]}
      />
    </Drawer>
  )
}
