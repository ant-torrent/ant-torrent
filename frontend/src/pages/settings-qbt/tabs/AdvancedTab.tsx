import { Form, InputNumber, Input, Switch, Select, Typography, Divider } from 'antd'
import { useTranslation } from 'react-i18next'

const { Text } = Typography

export default function AdvancedTab() {
  const { t } = useTranslation()
  const tt = (k: string) => t(`settings.qbt.advanced.${k}`)
  const name = (k: string) => ({ name: k })

  return (
    <>
      <Text strong>{tt('libtorrentTitle')}</Text>
      <Divider />

      <Form.Item label={tt('asyncIoThreads')} {...name('async_io_threads')} rules={[{ type: 'number', min: 1, max: 1024 }]}>
        <InputNumber min={1} max={1024} />
      </Form.Item>

      <Form.Item label={tt('hashingThreads')} {...name('hashing_threads')} rules={[{ type: 'number', min: 1, max: 64 }]}>
        <InputNumber min={1} max={64} />
      </Form.Item>

      <Form.Item label={tt('socketBacklog')} {...name('socket_backlog')} rules={[{ type: 'number', min: 1 }]}>
        <InputNumber min={1} />
      </Form.Item>

      <Form.Item label={tt('outgoingPortsMin')} {...name('outgoing_ports_min')} rules={[{ type: 'number', min: 0, max: 65535 }]}>
        <InputNumber min={0} max={65535} />
      </Form.Item>

      <Form.Item label={tt('outgoingPortsMax')} {...name('outgoing_ports_max')} rules={[{ type: 'number', min: 0, max: 65535 }]}>
        <InputNumber min={0} max={65535} />
      </Form.Item>

      <Form.Item label={tt('upnpLeaseDuration')} {...name('upnp_lease_duration')} rules={[{ type: 'number', min: 0 }]}>
        <InputNumber min={0} />
      </Form.Item>

      <Form.Item label={tt('utpTcpMixedMode')} {...name('utp_tcp_mixed_mode')}>
        <Select
          style={{ width: 220 }}
          options={[
            { label: tt('utpPreferTcp'), value: 0 },
            { label: tt('utpPeerProportional'), value: 1 },
          ]}
        />
      </Form.Item>

      <Form.Item label={tt('sendBufferWatermark')} {...name('send_buffer_watermark')} rules={[{ type: 'number', min: 1 }]}>
        <InputNumber min={1} />
      </Form.Item>

      <Form.Item label={tt('sendBufferLowWatermark')} {...name('send_buffer_low_watermark')} rules={[{ type: 'number', min: 1 }]}>
        <InputNumber min={1} />
      </Form.Item>

      <Form.Item label={tt('sendBufferWatermarkFactor')} {...name('send_buffer_watermark_factor')} rules={[{ type: 'number', min: 1 }]}>
        <InputNumber min={1} />
      </Form.Item>

      <Form.Item label={tt('diskCacheSize')} {...name('disk_cache_size')} rules={[{ type: 'number', min: -1 }]}>
        <InputNumber min={-1} />
      </Form.Item>

      <Form.Item label={tt('diskQueueSize')} {...name('disk_queue_size')} rules={[{ type: 'number', min: 1 }]}>
        <InputNumber min={1} />
      </Form.Item>

      <Form.Item label={tt('diskIoReadMode')} {...name('disk_io_read_mode')}>
        <Select
          style={{ width: 220 }}
          options={[
            { label: tt('ioModeDisableOsCache'), value: 0 },
            { label: tt('ioModeEnableOsCache'), value: 1 },
          ]}
        />
      </Form.Item>

      <Form.Item label={tt('diskIoWriteMode')} {...name('disk_io_write_mode')}>
        <Select
          style={{ width: 220 }}
          options={[
            { label: tt('ioModeDisableOsCache'), value: 0 },
            { label: tt('ioModeEnableOsCache'), value: 1 },
            { label: tt('ioModeWriteThrough'), value: 2 },
          ]}
        />
      </Form.Item>

      <Form.Item label={tt('uploadChokingAlgorithm')} {...name('upload_choking_algorithm')}>
        <Select
          style={{ width: 220 }}
          options={[
            { label: tt('chokingRoundRobin'), value: 0 },
            { label: tt('chokingFastestUpload'), value: 1 },
            { label: tt('chokingAntiLeech'), value: 2 },
          ]}
        />
      </Form.Item>

      <Form.Item label={tt('uploadSlotsBehavior')} {...name('upload_slots_behavior')}>
        <Select
          style={{ width: 220 }}
          options={[
            { label: tt('slotsFixed'), value: 0 },
            { label: tt('slotsUploadChoking'), value: 1 },
          ]}
        />
      </Form.Item>

      <Form.Item label={tt('announceIp')} {...name('announce_ip')}>
        <Input />
      </Form.Item>

      <Form.Item label={tt('maxConcurrentHttpAnnounces')} {...name('max_concurrent_http_announces')} rules={[{ type: 'number', min: 1 }]}>
        <InputNumber min={1} />
      </Form.Item>

      <Form.Item label={tt('stopTrackerTimeout')} {...name('stop_tracker_timeout')} rules={[{ type: 'number', min: 1 }]}>
        <InputNumber min={1} />
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('embeddedTrackerTitle')}</Text>
      <Divider />

      <Form.Item label={tt('enableEmbeddedTracker')} {...name('enable_embedded_tracker')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(p, c) => p.enable_embedded_tracker !== c.enable_embedded_tracker}>
        {({ getFieldValue }) => (
          <>
            <Form.Item label={tt('embeddedTrackerPort')} {...name('embedded_tracker_port')} rules={[{ type: 'number', min: 1, max: 65535 }]} style={{ marginLeft: 24 }}>
              <InputNumber min={1} max={65535} disabled={!getFieldValue('enable_embedded_tracker')} />
            </Form.Item>
            <Form.Item label={tt('embeddedTrackerPortForwarding')} {...name('embedded_tracker_port_forwarding')} valuePropName="checked" style={{ marginLeft: 24 }}>
              <Switch disabled={!getFieldValue('enable_embedded_tracker')} />
            </Form.Item>
          </>
        )}
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('miscTitle')}</Text>
      <Divider />

      <Form.Item label={tt('multiConnectionsPerIp')} {...name('enable_multi_connections_from_same_ip')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('validateHttpsTracker')} {...name('validate_https_tracker_certificate')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('ssrfMitigation')} {...name('ssrf_mitigation')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('recheckOnCompletion')} {...name('recheck_torrents_on_completion')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('refreshInterval')} {...name('refresh_interval')} rules={[{ type: 'number', min: 100 }]}>
        <InputNumber min={100} step={100} />
      </Form.Item>

      <Form.Item label={tt('resolvePeerCountries')} {...name('resolve_peer_countries')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('reannounceOnAddressChange')} {...name('reannounce_when_address_changed')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('enableOsCache')} {...name('enable_os_cache')} valuePropName="checked">
        <Switch />
      </Form.Item>
    </>
  )
}
