import { Form, Input, InputNumber, Switch, Select, Typography, Divider } from 'antd'
import { useTranslation } from 'react-i18next'

const { Text } = Typography

export default function BitTorrentTab() {
  const { t } = useTranslation()
  const tt = (k: string) => t(`settings.qbt.bittorrent.${k}`)
  const name = (k: string) => ({ name: k })

  return (
    <>
      <Text strong>{tt('privacyTitle')}</Text>
      <Divider />

      <Form.Item label={tt('encryption')} {...name('encryption')}>
        <Select
          style={{ width: 220 }}
          options={[
            { label: tt('encryptionPrefer'), value: 0 },
            { label: tt('encryptionForce'), value: 1 },
            { label: tt('encryptionDisable'), value: 2 },
          ]}
        />
      </Form.Item>

      <Form.Item label={tt('anonymousMode')} {...name('anonymous_mode')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('protocol')} {...name('bittorrent_protocol')}>
        <Select
          style={{ width: 220 }}
          options={[
            { label: tt('protocolTcpUtp'), value: 0 },
            { label: tt('protocolTcp'), value: 1 },
            { label: tt('protocolUtp'), value: 2 },
          ]}
        />
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('queueTitle')}</Text>
      <Divider />

      <Form.Item label={tt('queueEnabled')} {...name('queueing_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(p, c) => p.queueing_enabled !== c.queueing_enabled}>
        {({ getFieldValue }) => (
          <>
            <Form.Item label={tt('maxActiveDownloads')} {...name('max_active_downloads')} rules={[{ type: 'number', min: -1 }]} style={{ marginLeft: 24 }}>
              <InputNumber min={-1} disabled={!getFieldValue('queueing_enabled')} />
            </Form.Item>
            <Form.Item label={tt('maxActiveUploads')} {...name('max_active_uploads')} rules={[{ type: 'number', min: -1 }]} style={{ marginLeft: 24 }}>
              <InputNumber min={-1} disabled={!getFieldValue('queueing_enabled')} />
            </Form.Item>
            <Form.Item label={tt('maxActiveTorrents')} {...name('max_active_torrents')} rules={[{ type: 'number', min: -1 }]} style={{ marginLeft: 24 }}>
              <InputNumber min={-1} disabled={!getFieldValue('queueing_enabled')} />
            </Form.Item>
            <Form.Item label={tt('dontCountSlow')} {...name('dont_count_slow_torrents')} valuePropName="checked" style={{ marginLeft: 24 }}>
              <Switch disabled={!getFieldValue('queueing_enabled')} />
            </Form.Item>
            <Form.Item label={tt('slowDlThreshold')} {...name('slow_torrent_dl_rate_threshold')} rules={[{ type: 'number'}]} style={{ marginLeft: 24 }}>
              <InputNumber disabled={!getFieldValue('queueing_enabled')} />
            </Form.Item>
            <Form.Item label={tt('slowUlThreshold')} {...name('slow_torrent_ul_rate_threshold')} rules={[{ type: 'number'}]} style={{ marginLeft: 24 }}>
              <InputNumber disabled={!getFieldValue('queueing_enabled')} />
            </Form.Item>
            <Form.Item label={tt('slowInactiveTimer')} {...name('slow_torrent_inactive_timer')} rules={[{ type: 'number' }]} style={{ marginLeft: 24 }}>
              <InputNumber disabled={!getFieldValue('queueing_enabled')} />
            </Form.Item>
          </>
        )}
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('seedingLimitsTitle')}</Text>
      <Divider />

      <Form.Item label={tt('maxRatioEnabled')} {...name('max_ratio_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(p, c) => p.max_ratio_enabled !== c.max_ratio_enabled}>
        {({ getFieldValue }) => (
          <>
            <Form.Item label={tt('maxRatio')} {...name('max_ratio')} rules={[{ type: 'number' }]} style={{ marginLeft: 24 }}>
              <InputNumber step={0.1} disabled={!getFieldValue('max_ratio_enabled')} />
            </Form.Item>
            <Form.Item label={tt('maxRatioAct')} {...name('max_ratio_act')} style={{ marginLeft: 24 }}>
              <Select
                style={{ width: 220 }}
                disabled={!getFieldValue('max_ratio_enabled')}
                options={[
                  { label: tt('maxRatioActPause'), value: 0 },
                  { label: tt('maxRatioActRemove'), value: 1 },
                ]}
              />
            </Form.Item>
          </>
        )}
      </Form.Item>

      <Form.Item label={tt('maxSeedingTimeEnabled')} {...name('max_seeding_time_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(p, c) => p.max_seeding_time_enabled !== c.max_seeding_time_enabled}>
        {({ getFieldValue }) => (
          <Form.Item label={tt('maxSeedingTime')} {...name('max_seeding_time')} rules={[{ type: 'number' }]} style={{ marginLeft: 24 }}>
            <InputNumber disabled={!getFieldValue('max_seeding_time_enabled')} />
          </Form.Item>
        )}
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('dhtTitle')}</Text>
      <Divider />

      <Form.Item label={tt('dht')} {...name('dht')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('pex')} {...name('pex')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('lsd')} {...name('lsd')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('addTrackersEnabled')} {...name('add_trackers_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(p, c) => p.add_trackers_enabled !== c.add_trackers_enabled}>
        {({ getFieldValue }) => (
          <Form.Item label={tt('addTrackers')} {...name('add_trackers')} style={{ marginLeft: 24 }}>
            <Input.TextArea rows={3} disabled={!getFieldValue('add_trackers_enabled')} placeholder="udp://tracker.example.com:80/announce" />
          </Form.Item>
        )}
      </Form.Item>
    </>
  )
}
