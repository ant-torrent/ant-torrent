import { Card, Col, Row, Tag, Typography } from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CloudServerOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

import { useTorrentStore } from '@/stores/torrentStore'
import { useAppStore } from '@/stores/appStore'
import type { ConnectionStatus } from '@/services/types'
import { formatBytes, formatSpeed } from '@/utils/format'

import { TrafficStats } from './TrafficStats'

const { Text } = Typography

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: 'success',
  firewalled: 'warning',
  disconnected: 'error',
}

const STATUS_KEY: Record<ConnectionStatus, string> = {
  connected: 'dashboard.connectionConnected',
  firewalled: 'dashboard.connectionFirewalled',
  disconnected: 'dashboard.connectionDisconnected',
}

/** 数据看板 —— 服务器状态模块：每台服务器一张卡片 */
export function ServerStatus() {
  const { t } = useTranslation()
  const servers = useAppStore((s) => s.servers)
  const serverData = useTorrentStore((s) => s.serverData)

  if (servers.length === 0) return null

  return (
    <Card title={t('server.status')} size="small">
      <Row gutter={[16, 16]}>
        {/* 本次会话流量卡作为组内首卡，与其余服务器卡片等高 */}
        <Col xs={24} md={12} xl={8}>
          <TrafficStats />
        </Col>
        {servers.map((srv) => {
          const data = serverData[srv.id]
          const state = data?.server
          const torrentCount = data?.torrents.length ?? 0

          return (
            <Col xs={24} md={12} xl={8} key={srv.id}>
              <Card size="small" hoverable style={{ height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <CloudServerOutlined style={{ fontSize: 18 }} />
                  <Text strong style={{ flex: 1 }}>{srv.name}</Text>
                  {state && (
                    <Tag color={STATUS_COLOR[state.connection_status]}>
                      {t(STATUS_KEY[state.connection_status])}
                    </Tag>
                  )}
                </div>

                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  {srv.url}
                </Text>

                {state ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 13 }}>
                    <span>
                      <ArrowDownOutlined style={{ color: '#1677ff', marginRight: 4 }} />
                      {formatSpeed(state.dl_info_speed)}
                    </span>
                    <span>
                      <ArrowUpOutlined style={{ color: '#52c41a', marginRight: 4 }} />
                      {formatSpeed(state.up_info_speed)}
                    </span>
                    <span>
                      <FolderOpenOutlined style={{ marginRight: 4 }} />
                      {t('server.torrentCount')}: {torrentCount}
                    </span>
                    <span>
                      {t('dashboard.dhtNodes')}: {state.dht_nodes}
                    </span>
                    <span style={{ gridColumn: '1 / -1' }}>
                      {t('server.freeSpace')}: {formatBytes(state.free_space_on_disk)}
                    </span>
                  </div>
                ) : (
                  <Text type="secondary">{t('common.loading')}</Text>
                )}
              </Card>
            </Col>
          )
        })}
      </Row>
    </Card>
  )
}
