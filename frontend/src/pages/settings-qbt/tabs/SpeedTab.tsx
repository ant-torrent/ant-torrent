import { useMemo } from 'react'
import { Form, InputNumber, Switch, Select, TimePicker, Typography, Divider } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { torrentsApi } from '@/services/api/client'
import { refreshServer } from '@/hooks/useTorrentPolling'
import { useTorrentStore } from '@/stores/torrentStore'
import { useActiveServerId } from '../ServerIdContext'
import type { AppPreferences } from '@/services/types'

const { Text } = Typography

/** 限速输入：内层 input 允许收缩，避免文字滑到 suffix 下面被遮挡 */
const limitInputStyle = {
  style: { width: 180 },
  styles: { input: { minWidth: 0 } },
}

/** 按计划限速的起止时间控件：时间范围选择器桥接 qBittorrent 的 4 个独立数字字段 */
function ScheduleRangeControl({
  disabled,
  fromHour,
  fromMin,
  toHour,
  toMin,
}: {
  disabled: boolean
  fromHour: number
  fromMin: number
  toHour: number
  toMin: number
}) {
  const { t } = useTranslation()
  const form = Form.useFormInstance<AppPreferences>()
  const tt = (k: string) => t(`settings.qbt.speed.${k}`)

  // 秒/毫秒归零 + memoize：字段值不变时 value 时刻保持相等，
  // 否则每次渲染（含 1.5s tick）都产生新时刻，rc-picker 会当作外部改值而重置交互状态
  const value = useMemo<[Dayjs, Dayjs]>(
    () => [
      dayjs().hour(fromHour).minute(fromMin).second(0).millisecond(0),
      dayjs().hour(toHour).minute(toMin).second(0).millisecond(0),
    ],
    [fromHour, fromMin, toHour, toMin],
  )

  const handleChange = (values: [Dayjs | null, Dayjs | null] | null) => {
    const [from, to] = values ?? [null, null]
    form.setFieldsValue({
      schedule_from_hour: from?.hour() ?? 0,
      schedule_from_min: from?.minute() ?? 0,
      schedule_to_hour: to?.hour() ?? 0,
      schedule_to_min: to?.minute() ?? 0,
    })
  }

  return (
    <Form.Item label={tt('scheduleRange')}>
      <TimePicker.RangePicker format="HH:mm" disabled={disabled} value={value} onChange={handleChange} />
    </Form.Item>
  )
}

/** 从表单读取 4 个数字字段（仅在它们变化时重渲染）传给上面的控件 */
function ScheduleTimeRange({ disabled }: { disabled: boolean }) {
  return (
    <Form.Item
      noStyle
      shouldUpdate={(prev, cur) =>
        prev.schedule_from_hour !== cur.schedule_from_hour ||
        prev.schedule_from_min !== cur.schedule_from_min ||
        prev.schedule_to_hour !== cur.schedule_to_hour ||
        prev.schedule_to_min !== cur.schedule_to_min
      }
    >
      {({ getFieldValue }) => (
        <ScheduleRangeControl
          disabled={disabled}
          fromHour={getFieldValue('schedule_from_hour') ?? 0}
          fromMin={getFieldValue('schedule_from_min') ?? 0}
          toHour={getFieldValue('schedule_to_hour') ?? 0}
          toMin={getFieldValue('schedule_to_min') ?? 0}
        />
      )}
    </Form.Item>
  )
}

export default function SpeedTab() {
  const { t } = useTranslation()
  const tt = (k: string) => t(`settings.qbt.speed.${k}`)
  const name = (k: string) => ({ name: k })
  const serverId = useActiveServerId()
  const serverData = useTorrentStore((s) => s.serverData[serverId])
  const useAltSpeed = serverData?.server.use_alt_speed_limits ?? false

  const handleToggleAltSpeed = async () => {
    try {
      await torrentsApi.toggleSpeedLimitsMode(serverId)
      // 立即刷新该服务器快照，让开关状态即时回显（不等 2s 轮询）
      void refreshServer(serverId)
    } catch {
      // ignore
    }
  }

  return (
    <>
      <Text strong>{tt('globalLimitsTitle')}</Text>
      <Divider />

      <Form.Item label={tt('downloadLimit')} {...name('dl_limit')} rules={[{ type: 'number', min: 0 }]}>
        <InputNumber min={0} step={10} suffix="KiB/s" {...limitInputStyle} />
      </Form.Item>

      <Form.Item label={tt('uploadLimit')} {...name('up_limit')} rules={[{ type: 'number', min: 0 }]}>
        <InputNumber min={0} step={10} suffix="KiB/s" {...limitInputStyle} />
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('altLimitsTitle')}</Text>
      <Divider />

      <Form.Item label={tt('altDownloadLimit')} {...name('alt_dl_limit')} rules={[{ type: 'number', min: 0 }]}>
        <InputNumber min={0} step={10} suffix="KiB/s" {...limitInputStyle} />
      </Form.Item>

      <Form.Item label={tt('altUploadLimit')} {...name('alt_up_limit')} rules={[{ type: 'number', min: 0 }]}>
        <InputNumber min={0} step={10} suffix="KiB/s" {...limitInputStyle} />
      </Form.Item>

      <Form.Item label={tt('altSpeedToggle')} style={{ marginTop: 16 }}>
        <Switch checked={useAltSpeed} onChange={handleToggleAltSpeed} />
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('schedulerTitle')}</Text>
      <Divider />

      <Form.Item label={tt('schedulerEnabled')} {...name('scheduler_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(p, c) => p.scheduler_enabled !== c.scheduler_enabled}>
        {({ getFieldValue }) => (
          <>
            <ScheduleTimeRange disabled={!getFieldValue('scheduler_enabled')} />

            <Form.Item label={tt('schedulerDays')} {...name('scheduler_days')} style={{ marginLeft: 24 }}>
              <Select
                style={{ width: 200 }}
                disabled={!getFieldValue('scheduler_enabled')}
                options={[
                  { label: tt('daysEvery'), value: 0 },
                  { label: tt('daysWeekday'), value: 1 },
                  { label: tt('daysWeekend'), value: 2 },
                  { label: tt('daysMon'), value: 3 },
                  { label: tt('daysTue'), value: 4 },
                  { label: tt('daysWed'), value: 5 },
                  { label: tt('daysThu'), value: 6 },
                  { label: tt('daysFri'), value: 7 },
                  { label: tt('daysSat'), value: 8 },
                  { label: tt('daysSun'), value: 9 },
                ]}
              />
            </Form.Item>
          </>
        )}
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('rateLimitsTitle')}</Text>
      <Divider />

      <Form.Item label={tt('limitUtpRate')} {...name('limit_utp_rate')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('limitTcpOverhead')} {...name('limit_tcp_overhead')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('limitLanPeers')} {...name('limit_lan_peers')} valuePropName="checked">
        <Switch />
      </Form.Item>
    </>
  )
}
