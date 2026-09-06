import { SaveOutlined, UndoOutlined } from '@ant-design/icons'
import { Alert, App, Button, Checkbox, Form, Input, InputNumber, Select, Space, Spin, Switch, Tabs, TimePicker } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { ServerConfig } from '@/services/api/client'
import { trApi } from '@/services/api/transmission'
import { ServerIdProvider } from '@/pages/settings-qbt/ServerIdContext'
import ServerConnectionTab from '@/pages/settings-qbt/tabs/ServerConnectionTab'

/** 会话设置草稿（Transmission 原生单位：限速 KB/s、计划表分钟、闲置做种分钟）。 */
interface SessionDraft {
  speed_limit_up: number
  speed_limit_up_enabled: boolean
  speed_limit_down: number
  speed_limit_down_enabled: boolean
  alt_speed_up: number
  alt_speed_down: number
  alt_speed_enabled: boolean
  alt_speed_time_enabled: boolean
  alt_speed_time_begin: number
  alt_speed_time_end: number
  alt_speed_time_day: number
  download_dir: string
  incomplete_dir: string
  incomplete_dir_enabled: boolean
  rename_partial_files: boolean
  start_added_torrents: boolean
  trash_original_torrent_files: boolean
  download_queue_enabled: boolean
  download_queue_size: number
  seed_queue_enabled: boolean
  seed_queue_size: number
  queue_stalled_enabled: boolean
  queue_stalled_minutes: number
  seed_ratio_limited: boolean
  seed_ratio_limit: number
  idle_seeding_limit_enabled: boolean
  idle_seeding_limit: number
  peer_port: number
  peer_port_random_on_start: boolean
  port_forwarding_enabled: boolean
  peer_limit_global: number
  peer_limit_per_torrent: number
  encryption: string
  dht_enabled: boolean
  pex_enabled: boolean
  lpd_enabled: boolean
  blocklist_enabled: boolean
  blocklist_url: string
  cache_size_mib: number
  anti_brute_force_enabled: boolean
}

type SessionField = keyof SessionDraft
type SessionTabKey = 'downloads' | 'speed' | 'queue' | 'network' | 'advanced'

/** 保存和重置只操作当前页签拥有的字段。 */
const TAB_FIELDS: Record<SessionTabKey, SessionField[]> = {
  downloads: [
    'download_dir', 'incomplete_dir', 'incomplete_dir_enabled', 'rename_partial_files',
    'start_added_torrents', 'trash_original_torrent_files',
  ],
  speed: [
    'speed_limit_up', 'speed_limit_up_enabled', 'speed_limit_down', 'speed_limit_down_enabled',
    'alt_speed_up', 'alt_speed_down', 'alt_speed_enabled', 'alt_speed_time_enabled',
    'alt_speed_time_begin', 'alt_speed_time_end', 'alt_speed_time_day',
  ],
  queue: [
    'download_queue_enabled', 'download_queue_size', 'seed_queue_enabled', 'seed_queue_size',
    'queue_stalled_enabled', 'queue_stalled_minutes', 'seed_ratio_limited', 'seed_ratio_limit',
    'idle_seeding_limit_enabled', 'idle_seeding_limit',
  ],
  network: [
    'peer_port', 'peer_port_random_on_start', 'port_forwarding_enabled', 'peer_limit_global',
    'peer_limit_per_torrent', 'encryption', 'dht_enabled', 'pex_enabled', 'lpd_enabled',
  ],
  advanced: ['blocklist_enabled', 'blocklist_url', 'cache_size_mib', 'anti_brute_force_enabled'],
}

/** 从 session_get 全量配置中提取 UI 草稿。 */
function pickDraft(source: Record<string, unknown>): SessionDraft {
  const num = (key: string, fallback: number) => typeof source[key] === 'number' ? source[key] as number : fallback
  const bool = (key: string, fallback: boolean) => typeof source[key] === 'boolean' ? source[key] as boolean : fallback
  const str = (key: string, fallback = '') => typeof source[key] === 'string' ? source[key] as string : fallback
  const encryption = str('encryption', 'preferred')

  return {
    speed_limit_up: num('speed_limit_up', 0),
    speed_limit_up_enabled: bool('speed_limit_up_enabled', false),
    speed_limit_down: num('speed_limit_down', 0),
    speed_limit_down_enabled: bool('speed_limit_down_enabled', false),
    alt_speed_up: num('alt_speed_up', 0),
    alt_speed_down: num('alt_speed_down', 0),
    alt_speed_enabled: bool('alt_speed_enabled', false),
    alt_speed_time_enabled: bool('alt_speed_time_enabled', false),
    alt_speed_time_begin: num('alt_speed_time_begin', 540),
    alt_speed_time_end: num('alt_speed_time_end', 1020),
    alt_speed_time_day: num('alt_speed_time_day', 127),
    download_dir: str('download_dir'),
    incomplete_dir: str('incomplete_dir'),
    incomplete_dir_enabled: bool('incomplete_dir_enabled', false),
    rename_partial_files: bool('rename_partial_files', false),
    start_added_torrents: bool('start_added_torrents', true),
    trash_original_torrent_files: bool('trash_original_torrent_files', false),
    download_queue_enabled: bool('download_queue_enabled', false),
    download_queue_size: num('download_queue_size', 5),
    seed_queue_enabled: bool('seed_queue_enabled', false),
    seed_queue_size: num('seed_queue_size', 10),
    queue_stalled_enabled: bool('queue_stalled_enabled', true),
    queue_stalled_minutes: num('queue_stalled_minutes', 30),
    seed_ratio_limited: bool('seed_ratio_limited', false),
    seed_ratio_limit: num('seed_ratio_limit', 2),
    idle_seeding_limit_enabled: bool('idle_seeding_limit_enabled', false),
    idle_seeding_limit: num('idle_seeding_limit', 30),
    peer_port: num('peer_port', 51413),
    peer_port_random_on_start: bool('peer_port_random_on_start', false),
    port_forwarding_enabled: bool('port_forwarding_enabled', true),
    peer_limit_global: num('peer_limit_global', 240),
    peer_limit_per_torrent: num('peer_limit_per_torrent', 60),
    encryption: ['required', 'preferred', 'allowed'].includes(encryption) ? encryption : 'preferred',
    dht_enabled: bool('dht_enabled', true),
    pex_enabled: bool('pex_enabled', true),
    lpd_enabled: bool('lpd_enabled', true),
    blocklist_enabled: bool('blocklist_enabled', false),
    blocklist_url: str('blocklist_url'),
    cache_size_mib: num('cache_size_mib', 4),
    anti_brute_force_enabled: bool('anti_brute_force_enabled', true),
  }
}

const EMPTY_DRAFT = pickDraft({})

/** 备用限速星期位掩码：bit0=周日，bit1=周一，…，bit6=周六。 */
const DAY_OPTIONS = [
  { bit: 1, key: 'sun' }, { bit: 2, key: 'mon' }, { bit: 4, key: 'tue' },
  { bit: 8, key: 'wed' }, { bit: 16, key: 'thu' }, { bit: 32, key: 'fri' },
  { bit: 64, key: 'sat' },
] as const

function fieldsOf(draft: SessionDraft, tabKey: SessionTabKey): Partial<SessionDraft> {
  return Object.fromEntries(TAB_FIELDS[tabKey].map((field) => [field, draft[field]])) as Partial<SessionDraft>
}

/** Transmission 单服务器设置面板：连接配置 + 按 RPC 类别拆分的会话设置。 */
export function TransmissionSettingsPanel({ server }: { server: ServerConfig }) {
  const { t } = useTranslation()
  const tt = (key: string) => t(`settings.transmission.session.${key}`)
  const { message } = App.useApp()
  const serverId = server.id

  const [draft, setDraft] = useState<SessionDraft>({ ...EMPTY_DRAFT })
  const [baseline, setBaseline] = useState<SessionDraft>({ ...EMPTY_DRAFT })
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingTab, setSavingTab] = useState<SessionTabKey | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const next = pickDraft(await trApi.getSession(serverId))
      setDraft(next)
      setBaseline(next)
      setLoaded(true)
    } catch (error) {
      setLoaded(false)
      setLoadError(error instanceof Error ? error.message : t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [serverId, t])

  useEffect(() => {
    void load()
  }, [load])

  const patch = (values: Partial<SessionDraft>) => {
    setDraft((previous) => ({ ...previous, ...values }))
  }

  const handleSave = async (tabKey: SessionTabKey) => {
    const payload = fieldsOf(draft, tabKey)
    setSavingTab(tabKey)
    try {
      await trApi.updateSession(serverId, payload)
      setBaseline((previous) => ({ ...previous, ...payload }))
      message.success(t('common.saved'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('common.saveFailed'))
    } finally {
      setSavingTab(null)
    }
  }

  const handleReset = (tabKey: SessionTabKey) => {
    setDraft((previous) => ({ ...previous, ...fieldsOf(baseline, tabKey) }))
    message.info(t('common.reset'))
  }

  const formLayout = (children: ReactNode) => (
    <Form
      layout="horizontal"
      labelCol={{ flex: '0 0 220px' }}
      wrapperCol={{ flex: 'auto' }}
      labelWrap
      component={false}
    >
      {children}
    </Form>
  )

  const sessionTab = (children: ReactNode, tabKey: SessionTabKey) => (
    <div style={{ maxWidth: 780, paddingTop: 16 }}>
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>
      ) : loadError ? (
        <Alert
          type="error"
          showIcon
          title={t('common.loadFailed')}
          description={loadError}
          action={<Button size="small" onClick={() => void load()}>{t('common.retry')}</Button>}
        />
      ) : formLayout(
        <>
          {children}
          <Form.Item label=" " colon={false}>
            <Space>
              <Button icon={<UndoOutlined />} onClick={() => handleReset(tabKey)} disabled={!loaded}>
                {t('common.reset')}
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => void handleSave(tabKey)}
                loading={savingTab === tabKey}
                disabled={!loaded || (savingTab !== null && savingTab !== tabKey)}
              >
                {t('common.save')}
              </Button>
            </Space>
          </Form.Item>
        </>,
      )}
    </div>
  )

  const dayValues = DAY_OPTIONS
    .filter(({ bit }) => (draft.alt_speed_time_day & bit) !== 0)
    .map(({ bit }) => String(bit))

  // 秒/毫秒归零并保持值引用稳定，避免 rc-picker 在其他字段更新时重置交互状态。
  const altSpeedTimeRange = useMemo<[Dayjs, Dayjs]>(
    () => [
      dayjs().startOf('day').add(draft.alt_speed_time_begin, 'minute'),
      dayjs().startOf('day').add(draft.alt_speed_time_end, 'minute'),
    ],
    [draft.alt_speed_time_begin, draft.alt_speed_time_end],
  )

  const handleAltSpeedTimeChange = (values: [Dayjs | null, Dayjs | null] | null) => {
    const [begin, end] = values ?? [null, null]
    patch({
      alt_speed_time_begin: begin ? begin.hour() * 60 + begin.minute() : 0,
      alt_speed_time_end: end ? end.hour() * 60 + end.minute() : 0,
    })
  }

  const downloads = (
    <>
      <Form.Item label={tt('downloadDir')}>
        <Input value={draft.download_dir} onChange={(event) => patch({ download_dir: event.target.value })} placeholder={tt('downloadDirPlaceholder')} />
      </Form.Item>
      <Form.Item label={tt('incompleteDirEnabled')}>
        <Space size={8}>
          <Switch checked={draft.incomplete_dir_enabled} onChange={(checked) => patch({ incomplete_dir_enabled: checked })} />
          <Input
            value={draft.incomplete_dir}
            onChange={(event) => patch({ incomplete_dir: event.target.value })}
            placeholder={tt('incompleteDirPlaceholder')}
            disabled={!draft.incomplete_dir_enabled}
            style={{ width: 300 }}
          />
        </Space>
      </Form.Item>
      <Form.Item label={tt('renamePartialFiles')}>
        <Switch checked={draft.rename_partial_files} onChange={(checked) => patch({ rename_partial_files: checked })} />
      </Form.Item>
      <Form.Item label={tt('startAddedTorrents')}>
        <Switch checked={draft.start_added_torrents} onChange={(checked) => patch({ start_added_torrents: checked })} />
      </Form.Item>
      <Form.Item label={tt('trashOriginalTorrentFiles')}>
        <Switch checked={draft.trash_original_torrent_files} onChange={(checked) => patch({ trash_original_torrent_files: checked })} />
      </Form.Item>
    </>
  )

  const speed = (
    <>
      <Form.Item label={tt('speedLimitDown')}>
        <Space size={8}>
          <Switch
            checked={draft.speed_limit_down_enabled}
            onChange={(checked) => patch({ speed_limit_down_enabled: checked })}
          />
          <InputNumber
            min={0}
            value={draft.speed_limit_down}
            onChange={(value) => patch({ speed_limit_down: value ?? 0 })}
            disabled={!draft.speed_limit_down_enabled}
            style={{ width: 110 }}
          />
          <span>{tt('unitKbps')}</span>
        </Space>
      </Form.Item>
      <Form.Item label={tt('speedLimitUp')}>
        <Space size={8}>
          <Switch
            checked={draft.speed_limit_up_enabled}
            onChange={(checked) => patch({ speed_limit_up_enabled: checked })}
          />
          <InputNumber
            min={0}
            value={draft.speed_limit_up}
            onChange={(value) => patch({ speed_limit_up: value ?? 0 })}
            disabled={!draft.speed_limit_up_enabled}
            style={{ width: 110 }}
          />
          <span>{tt('unitKbps')}</span>
        </Space>
      </Form.Item>
      <Form.Item label={tt('altSpeed')}>
        <Space size={8} wrap>
          <Switch
            checked={draft.alt_speed_enabled}
            onChange={(checked) => patch({ alt_speed_enabled: checked })}
          />
          <InputNumber
            min={0}
            value={draft.alt_speed_down}
            onChange={(value) => patch({ alt_speed_down: value ?? 0 })}
            disabled={!draft.alt_speed_enabled}
            style={{ width: 110 }}
          />
          <span>{tt('downloadUnitKbps')}</span>
          <InputNumber
            min={0}
            value={draft.alt_speed_up}
            onChange={(value) => patch({ alt_speed_up: value ?? 0 })}
            disabled={!draft.alt_speed_enabled}
            style={{ width: 110 }}
          />
          <span>{tt('uploadUnitKbps')}</span>
        </Space>
      </Form.Item>
      <Form.Item label={tt('altSpeedSchedule')}>
        <Space size={8} wrap>
          <Switch
            checked={draft.alt_speed_time_enabled}
            onChange={(checked) => patch({ alt_speed_time_enabled: checked })}
          />
          <TimePicker.RangePicker
            format="HH:mm"
            order={false}
            value={altSpeedTimeRange}
            onChange={handleAltSpeedTimeChange}
            disabled={!draft.alt_speed_time_enabled}
          />
          <Select
            mode="multiple"
            allowClear
            placeholder={tt('weekdaysPlaceholder')}
            value={dayValues}
            onChange={(values) =>
              patch({ alt_speed_time_day: values.reduce((mask, value) => mask | Number(value), 0) })
            }
            disabled={!draft.alt_speed_time_enabled}
            style={{ minWidth: 210 }}
            options={DAY_OPTIONS.map(({ bit, key }) => ({
              value: String(bit),
              label: tt(`weekdays.${key}`),
            }))}
          />
        </Space>
      </Form.Item>
    </>
  )

  const queue = (
    <>
      <Form.Item label={tt('downloadQueue')}>
        <Space size={8}>
          <Switch checked={draft.download_queue_enabled} onChange={(checked) => patch({ download_queue_enabled: checked })} />
          <InputNumber min={0} value={draft.download_queue_size} onChange={(value) => patch({ download_queue_size: value ?? 5 })} disabled={!draft.download_queue_enabled} style={{ width: 110 }} />
        </Space>
      </Form.Item>
      <Form.Item label={tt('seedQueue')}>
        <Space size={8}>
          <Switch checked={draft.seed_queue_enabled} onChange={(checked) => patch({ seed_queue_enabled: checked })} />
          <InputNumber min={0} value={draft.seed_queue_size} onChange={(value) => patch({ seed_queue_size: value ?? 10 })} disabled={!draft.seed_queue_enabled} style={{ width: 110 }} />
        </Space>
      </Form.Item>
      <Form.Item label={tt('queueStalled')}>
        <Space size={8}>
          <Switch checked={draft.queue_stalled_enabled} onChange={(checked) => patch({ queue_stalled_enabled: checked })} />
          <InputNumber
            min={0}
            value={draft.queue_stalled_minutes}
            onChange={(value) => patch({ queue_stalled_minutes: value ?? 30 })}
            disabled={!draft.queue_stalled_enabled}
            style={{ width: 110 }}
          />
          <span>{tt('unitMinutes')}</span>
        </Space>
      </Form.Item>
      <Form.Item label={tt('seedRatioLimit')}>
        <Space size={8}>
          <Switch checked={draft.seed_ratio_limited} onChange={(checked) => patch({ seed_ratio_limited: checked })} />
          <InputNumber min={0} step={0.1} value={draft.seed_ratio_limit} onChange={(value) => patch({ seed_ratio_limit: value ?? 2 })} disabled={!draft.seed_ratio_limited} style={{ width: 110 }} />
        </Space>
      </Form.Item>
      <Form.Item label={tt('idleSeedingLimit')}>
        <Space size={8}>
          <Switch checked={draft.idle_seeding_limit_enabled} onChange={(checked) => patch({ idle_seeding_limit_enabled: checked })} />
          <InputNumber
            min={0}
            value={draft.idle_seeding_limit}
            onChange={(value) => patch({ idle_seeding_limit: value ?? 30 })}
            disabled={!draft.idle_seeding_limit_enabled}
            style={{ width: 110 }}
          />
          <span>{tt('unitMinutes')}</span>
        </Space>
      </Form.Item>
    </>
  )

  const network = (
    <>
      <Form.Item label={tt('peerPort')}>
        <Space size={8} wrap>
          <InputNumber min={1} max={65535} value={draft.peer_port} onChange={(value) => patch({ peer_port: value ?? 51413 })} disabled={draft.peer_port_random_on_start} style={{ width: 120 }} />
          <Checkbox checked={draft.peer_port_random_on_start} onChange={(event) => patch({ peer_port_random_on_start: event.target.checked })}>
            {tt('randomPort')}
          </Checkbox>
        </Space>
      </Form.Item>
      <Form.Item label={tt('portForwarding')}>
        <Switch checked={draft.port_forwarding_enabled} onChange={(checked) => patch({ port_forwarding_enabled: checked })} />
      </Form.Item>
      <Form.Item label={tt('peerLimitGlobal')}>
        <InputNumber min={1} value={draft.peer_limit_global} onChange={(value) => patch({ peer_limit_global: value ?? 240 })} style={{ width: 120 }} />
      </Form.Item>
      <Form.Item label={tt('peerLimitPerTorrent')}>
        <InputNumber min={1} value={draft.peer_limit_per_torrent} onChange={(value) => patch({ peer_limit_per_torrent: value ?? 60 })} style={{ width: 120 }} />
      </Form.Item>
      <Form.Item label={tt('encryption')}>
        <Select
          value={draft.encryption}
          onChange={(value) => patch({ encryption: value })}
          style={{ width: 200 }}
          options={[
            { value: 'required', label: tt('encryptRequired') },
            { value: 'preferred', label: tt('encryptPreferred') },
            { value: 'allowed', label: tt('encryptAllowed') },
          ]}
        />
      </Form.Item>
      <Form.Item label={tt('p2pDiscovery')}>
        <Space size={16} wrap>
          {([['dht_enabled', 'dht'], ['pex_enabled', 'pex'], ['lpd_enabled', 'lpd']] as const).map(([field, label]) => (
            <Space key={field} size={6}>
              <span>{tt(label)}</span>
              <Switch checked={draft[field]} onChange={(checked) => patch({ [field]: checked })} />
            </Space>
          ))}
        </Space>
      </Form.Item>
    </>
  )

  const advanced = (
    <>
      <Form.Item label={tt('blocklistEnabled')}>
        <Space size={8} wrap>
          <Switch checked={draft.blocklist_enabled} onChange={(checked) => patch({ blocklist_enabled: checked })} />
          <Input value={draft.blocklist_url} onChange={(event) => patch({ blocklist_url: event.target.value })} placeholder={tt('blocklistUrlPlaceholder')} disabled={!draft.blocklist_enabled} style={{ width: 360 }} />
        </Space>
      </Form.Item>
      <Form.Item label={tt('cacheSize')}>
        <Space size={8}>
          <InputNumber min={0} value={draft.cache_size_mib} onChange={(value) => patch({ cache_size_mib: value ?? 4 })} style={{ width: 110 }} />
          <span>{tt('unitMib')}</span>
        </Space>
      </Form.Item>
      <Form.Item label={tt('antiBruteForce')}>
        <Switch checked={draft.anti_brute_force_enabled} onChange={(checked) => patch({ anti_brute_force_enabled: checked })} />
      </Form.Item>
    </>
  )

  const tabs = [
    {
      key: 'connection',
      label: t('settings.transmission.tabs.connection'),
      children: <div style={{ maxWidth: 680, paddingTop: 16 }}>{formLayout(<ServerConnectionTab serverId={serverId} />)}</div>,
      forceRender: true,
    },
    { key: 'downloads', label: t('settings.transmission.tabs.downloads'), children: sessionTab(downloads, 'downloads'), forceRender: true },
    { key: 'speed', label: t('settings.transmission.tabs.speed'), children: sessionTab(speed, 'speed'), forceRender: true },
    { key: 'queue', label: t('settings.transmission.tabs.queue'), children: sessionTab(queue, 'queue'), forceRender: true },
    { key: 'network', label: t('settings.transmission.tabs.network'), children: sessionTab(network, 'network'), forceRender: true },
    { key: 'advanced', label: t('settings.transmission.tabs.advanced'), children: sessionTab(advanced, 'advanced'), forceRender: true },
  ]

  return (
    <ServerIdProvider value={serverId}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Tabs items={tabs} />
      </div>
    </ServerIdProvider>
  )
}
