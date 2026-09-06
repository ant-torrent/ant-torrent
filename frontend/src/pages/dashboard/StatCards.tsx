import { Col, Row, theme } from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ClockCircleOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

import { StatCard } from '@/components/StatCard'
import { useTorrentStats } from '@/hooks/useTorrentStats'
import type { ConnectionStatus } from '@/services/types'
import { useTorrentStore } from '@/stores/torrentStore'
import { formatDuration, formatSpeed } from '@/utils/format'

const CONNECTION_KEY: Record<ConnectionStatus, string> = {
  connected: 'dashboard.connectionConnected',
  firewalled: 'dashboard.connectionFirewalled',
  disconnected: 'dashboard.connectionDisconnected',
}

/** 看板首行四张统计卡 */
export function StatCards() {
  const { t } = useTranslation()
  const { token } = theme.useToken()
  const torrents = useTorrentStore((s) => s.torrents)
  const server = useTorrentStore((s) => s.server)
  const { total, groupCounts } = useTorrentStats(torrents)

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          title={t('dashboard.downloadSpeed')}
          value={formatSpeed(server.dl_info_speed)}
          icon={<ArrowDownOutlined />}
          iconColor="#1677ff"
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          title={t('dashboard.uploadSpeed')}
          value={formatSpeed(server.up_info_speed)}
          icon={<ArrowUpOutlined />}
          iconColor="#52c41a"
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          title={t('dashboard.torrentsTotal')}
          value={total}
          icon={<FolderOpenOutlined />}
          iconColor="#722ed1"
          extra={`${t('statusGroup.downloading')} ${groupCounts.downloading} · ${t('statusGroup.seeding')} ${groupCounts.seeding}`}
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          title={t('dashboard.uptime')}
          value={formatDuration(server.uptime)}
          icon={<ClockCircleOutlined />}
          iconColor="#fa8c16"
          extra={
            <span style={{ color: token.colorTextTertiary }}>
              {t('dashboard.connectionStatus')}: {t(CONNECTION_KEY[server.connection_status])} · DHT{' '}
              {server.dht_nodes}
            </span>
          }
        />
      </Col>
    </Row>
  )
}
