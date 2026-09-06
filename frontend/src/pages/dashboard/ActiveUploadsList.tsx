import { UploadOutlined } from '@ant-design/icons'
import { theme } from 'antd'
import { useTranslation } from 'react-i18next'

import { useTorrentStats } from '@/hooks/useTorrentStats'
import { useTorrentStore } from '@/stores/torrentStore'

import { ActiveTorrentsCard } from './ActiveTorrentsList'

/** 活跃上传 Top5（按上传速度），与活跃下载卡共用结构、高度一致 */
export function ActiveUploadsList() {
  const { t } = useTranslation()
  const { token } = theme.useToken()
  const torrents = useTorrentStore((s) => s.torrents)
  const { topUploads } = useTorrentStats(torrents)

  return (
    <ActiveTorrentsCard
      title={t('dashboard.activeUploadTitle')}
      sub={t('dashboard.activeUploadSub')}
      items={topUploads}
      icon={<UploadOutlined />}
      color={token.colorSuccess}
      speedOf={(torrent) => torrent.upspeed}
    />
  )
}
