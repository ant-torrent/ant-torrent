import { Card, Statistic } from 'antd'
import type { ReactNode } from 'react'

interface StatCardProps {
  title: ReactNode
  value: ReactNode
  icon?: ReactNode
  /** 图标底色（antd 预设色名或 hex） */
  iconColor?: string
  suffix?: ReactNode
  /** 标题下方/数值上方的辅助信息 */
  extra?: ReactNode
  /** 数值告警色（如磁盘不足） */
  valueStyle?: React.CSSProperties
}

/** 看板统计卡：左图标右数值，视觉统一 */
export function StatCard({ title, value, icon, iconColor, suffix, extra, valueStyle }: StatCardProps) {
  return (
    <Card
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{
        body: {
          padding: '18px 20px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        },
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {icon ? (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              color: iconColor,
              background: `color-mix(in srgb, ${iconColor} 14%, transparent)`,
            }}
          >
            {icon}
          </div>
        ) : null}
        <Statistic
          title={title}
          styles={{ content: { fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums', ...valueStyle } }}
          formatter={() => (
            <span>
              {value}
              {suffix ? <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>{suffix}</span> : null}
            </span>
          )}
        />
      </div>
      {extra ? <div style={{ marginTop: 10, fontSize: 12 }}>{extra}</div> : null}
    </Card>
  )
}
