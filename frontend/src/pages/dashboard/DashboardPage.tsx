import { Col, Row, Space } from 'antd'
import { useTranslation } from 'react-i18next'

import { ActiveTorrentsList } from './ActiveTorrentsList'
import { ActiveUploadsList } from './ActiveUploadsList'
import { ServerStatus } from './ServerStatus'
import { SpeedChart } from './SpeedChart'
import { StatCards } from './StatCards'
import { StatusBreakdown } from './StatusBreakdown'

/** 数据看板：统计卡 → 服务器状态（含本次会话） → 实时速度图 + 状态分布 → 活跃下载 + 活跃上传 */
export default function DashboardPage() {
  const { t } = useTranslation()

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }} aria-label={t('dashboard.title')}>
      <StatCards />
      <ServerStatus />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <SpeedChart />
        </Col>
        <Col xs={24} xl={8}>
          <StatusBreakdown />
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <ActiveTorrentsList />
        </Col>
        <Col xs={24} xl={12}>
          <ActiveUploadsList />
        </Col>
      </Row>
    </Space>
  )
}
