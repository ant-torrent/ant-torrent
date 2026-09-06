import { Area } from '@ant-design/plots'
import { Badge, Card, Space, Typography } from 'antd'
import dayjs from 'dayjs'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useTorrentStore } from '@/stores/torrentStore'
import { useIsDark } from '@/theme/ThemeProvider'
import { formatSpeed } from '@/utils/format'

/** 下载/上传双系列配色 —— 已通过 dataviz 六项校验（浅色 on #fff / 深色 on #141414） */
const SERIES_COLORS = {
  light: ['#1677ff', '#52c41a'],
  dark: ['#1668dc', '#49aa38'],
}

/** 实时速度叠加面积图（下载/上传为同单位独立度量，不做堆叠） */
export function SpeedChart() {
  const { t } = useTranslation()
  const isDark = useIsDark()
  const history = useTorrentStore((s) => s.history)
  const server = useTorrentStore((s) => s.server)

  const dlLabel = t('dashboard.legendDownload')
  const upLabel = t('dashboard.legendUpload')

  const data = useMemo(
    () =>
      history.flatMap((p) => [
        { t: p.t, series: dlLabel, v: p.dl },
        { t: p.t, series: upLabel, v: p.up },
      ]),
    [history, dlLabel, upLabel],
  )

  const connStatus =
    server.connection_status === 'connected' ? 'success' : server.connection_status === 'firewalled' ? 'warning' : 'default'
  const connText = t(
    server.connection_status === 'connected'
      ? 'dashboard.connectionConnected'
      : server.connection_status === 'firewalled'
        ? 'dashboard.connectionFirewalled'
        : 'dashboard.connectionDisconnected',
  )

  return (
    <Card
      title={t('dashboard.speedChartTitle')}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      extra={
        <Space size={16} wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('dashboard.dhtNodes')}: {server.dht_nodes}
          </Typography.Text>
          <Badge status={connStatus} text={connText} />
        </Space>
      }
      styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } }}
    >
      {/* 不传 height：plots v2 默认 autoFit，图表随容器填满卡片剩余高度。
          wrapper 的 height: 0 + flex 让其高度纯由 flex 分配、与 canvas 内容解耦；
          containerStyle 覆盖 plots 默认的 height:'inherit'（会继承到计算值 0），改用 100% 取 flex 解析后的实际高度，
          二者共同避免 autoFit 观察器与 height:100% 卡片链形成"canvas 变高 → 卡片变高 → canvas 再变高"的循环 */}
      <div style={{ flex: 1, height: 0, minHeight: 260 }}>
        <Area
          data={data}
          xField="t"
          yField="v"
          colorField="series"
          containerStyle={{ height: '100%' }}
          theme={isDark ? 'classicDark' : 'classic'}
          scale={{
            color: { domain: [dlLabel, upLabel], range: isDark ? SERIES_COLORS.dark : SERIES_COLORS.light },
            y: { nice: true },
          }}
          axis={{
            x: { title: false, labelFormatter: (v: number) => dayjs.unix(v).format('HH:mm:ss') },
            y: { title: false, labelFormatter: (v: number) => formatSpeed(v) },
          }}
          legend={{ color: { position: 'top' } }}
          tooltip={{
            title: (d: { t: number }) => dayjs.unix(d.t).format('HH:mm:ss'),
            items: [{ channel: 'y', valueFormatter: (v: number) => formatSpeed(v) }],
          }}
          style={{ fillOpacity: 0.16, lineWidth: 2 }}
          // plots v2 typings 未暴露 animate 但 G2 v5 运行时支持，1.5s 刷新场景必须禁用动画防抖动
          // @ts-expect-error animate 是 G2 mark-level 透传键，plots 类型未声明
          animate={false}
        />
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
        {t('dashboard.speedChartSub')}
      </Typography.Text>
    </Card>
  )
}
