import { Card, Typography, theme } from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  HddOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

import { useTorrentStore } from '@/stores/torrentStore'
import { formatBytes } from '@/utils/format'

const { Text } = Typography

/** 剩余空间告警阈值：10 GiB */
const FREE_SPACE_WARN = 10 * 1024 ** 3

/** 流量统计：本次会话 / 历史累计 / 磁盘剩余。
 *  作为服务器状态组首卡展示，结构与服务器卡片对齐（标题行 + 副标题 + 两列网格） */
export function TrafficStats() {
  const { t } = useTranslation()
  const { token } = theme.useToken()
  const server = useTorrentStore((s) => s.server)
  const lowSpace = server.free_space_on_disk < FREE_SPACE_WARN

  return (
    <Card size="small" hoverable style={{ height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <SwapOutlined style={{ fontSize: 18 }} />
        <Text strong style={{ flex: 1 }}>
          {t('dashboard.trafficTitle')}
        </Text>
      </div>

      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
        {t('dashboard.sessionSub')}
      </Text>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 13 }}>
        <span>
          <ArrowDownOutlined style={{ color: '#1677ff', marginRight: 4 }} />
          {t('dashboard.sessionDown')}: {formatBytes(server.dl_info_data)}
        </span>
        <span>
          <ArrowUpOutlined style={{ color: '#52c41a', marginRight: 4 }} />
          {t('dashboard.sessionUp')}: {formatBytes(server.up_info_data)}
        </span>
        <span>
          <ArrowDownOutlined style={{ color: '#1677ff', marginRight: 4 }} />
          {t('dashboard.alltimeDown')}: {formatBytes(server.alltime_dl)}
        </span>
        <span>
          <ArrowUpOutlined style={{ color: '#52c41a', marginRight: 4 }} />
          {t('dashboard.alltimeUp')}: {formatBytes(server.alltime_ul)}
        </span>
        <span
          style={{
            gridColumn: '1 / -1',
            color: lowSpace ? token.colorError : undefined,
          }}
        >
          <HddOutlined
            style={{ marginRight: 4, color: lowSpace ? token.colorError : token.colorTextTertiary }}
          />
          {t('dashboard.freeSpace')}: {formatBytes(server.free_space_on_disk)}
        </span>
      </div>
    </Card>
  )
}
