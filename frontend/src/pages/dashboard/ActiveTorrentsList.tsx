import { Card, Empty, Listy, Progress, Typography, theme } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useTorrentStats } from '@/hooks/useTorrentStats'
import type { Torrent } from '@/services/types'
import { useTorrentStore } from '@/stores/torrentStore'
import { formatSpeed } from '@/utils/format'

/** 列表固定高度（每条 62px × Top5）：不足 5 条时留白，避免卡片高度随条数跳动 */
const LIST_HEIGHT = 5 * 62

interface ActiveTorrentsCardProps {
  title: string
  /** 卡片右上角说明文字 */
  sub: string
  items: Torrent[]
  /** 速度前缀图标 */
  icon: ReactNode
  /** 图标与进度条颜色（下载蓝 / 上传绿） */
  color: string
  speedOf: (torrent: Torrent) => number
}

/** 活跃种子卡（活跃下载/活跃上传共用）：名字 + 速度 + 进度条，点击跳转种子列表 */
export function ActiveTorrentsCard({ title, sub, items, icon, color, speedOf }: ActiveTorrentsCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const renderItem = (item: Torrent) => (
    <div
      style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}
      onClick={() => navigate('/torrents')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <Typography.Text ellipsis={{ tooltip: item.name }} style={{ flex: 1, minWidth: 0 }}>
          {item.name}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
          <span style={{ color, marginRight: 4 }}>{icon}</span>
          {formatSpeed(speedOf(item))}
        </Typography.Text>
      </div>
      <Progress percent={Math.round(item.progress * 100)} size="small" strokeColor={color} />
    </div>
  )

  return (
    <Card
      title={title}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      extra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {sub}
        </Typography.Text>
      }
      styles={{
        body: {
          padding: '8px 20px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: 0,
        },
      }}
    >
      {items.length === 0 ? (
        <div
          style={{
            minHeight: LIST_HEIGHT,
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.empty')} />
        </div>
      ) : (
        <Listy
          items={items}
          rowKey="hash"
          itemRender={renderItem}
          height={LIST_HEIGHT}
          styles={{ item: { padding: '10px 0' } }}
        />
      )}
    </Card>
  )
}

/** 活跃下载 Top5（按下载速度） */
export function ActiveTorrentsList() {
  const { t } = useTranslation()
  const { token } = theme.useToken()
  const torrents = useTorrentStore((s) => s.torrents)
  const { topDownloads } = useTorrentStats(torrents)

  return (
    <ActiveTorrentsCard
      title={t('dashboard.activeTitle')}
      sub={t('dashboard.activeSub')}
      items={topDownloads}
      icon={<DownloadOutlined />}
      color={token.colorPrimary}
      speedOf={(torrent) => torrent.dlspeed}
    />
  )
}
