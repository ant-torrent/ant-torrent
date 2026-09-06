import { Card, Empty, Progress, theme } from 'antd'
import { useTranslation } from 'react-i18next'

import { useTorrentStats } from '@/hooks/useTorrentStats'
import { STATUS_GROUPS, statusGroupI18nKey } from '@/services/status'
import { useTorrentStore } from '@/stores/torrentStore'

/** 状态分组色（状态语义色，与列表页状态组 Tabs 一致） */
const GROUP_COLORS: Record<string, string> = {
  downloading: '#1677ff',
  seeding: '#52c41a',
  completed: '#13c2c2',
  paused: '#8c8c8c',
  errored: '#ff4d4f',
  checking: '#722ed1',
}

/** 状态分布：六组计数 + 占比条 */
export function StatusBreakdown() {
  const { t } = useTranslation()
  const { token } = theme.useToken()
  const torrents = useTorrentStore((s) => s.torrents)
  const { total, groupCounts } = useTorrentStats(torrents)

  return (
    <Card
      title={t('dashboard.statusBreakdownTitle')}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{
        body: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: 320,
          flex: 1,
        },
      }}
    >
      {total === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.empty')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {STATUS_GROUPS.map((group) => {
            const count = groupCounts[group]
            const percent = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <div key={group}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4,
                    fontSize: 13,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: GROUP_COLORS[group],
                        display: 'inline-block',
                      }}
                    />
                    {t(statusGroupI18nKey(group))}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: token.colorTextSecondary }}>
                    {count} · {percent}%
                  </span>
                </div>
                <Progress
                  percent={percent}
                  showInfo={false}
                  size="small"
                  strokeColor={GROUP_COLORS[group]}
                  railColor={token.colorFillSecondary}
                />
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
