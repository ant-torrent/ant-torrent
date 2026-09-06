import { Form, Input, Switch, Select, Typography, Divider } from 'antd'
import { useTranslation } from 'react-i18next'

const { Text } = Typography

export default function BehaviorTab() {
  const { t } = useTranslation()
  const tt = (k: string) => t(`settings.qbt.behavior.${k}`)
  const name = (k: string) => ({ name: k })

  return (
    <>
      {/* 界面语言（locale）不在此配置：qBittorrent 界面语言由 qB 自身 WebUI 管理，保存时也不下发该键 */}

      <Form.Item label={tt('startPaused')} {...name('add_stopped_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('confirmDeletion')} {...name('confirm_torrent_deletion')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('confirmRecheck')} {...name('confirm_torrent_recheck')} valuePropName="checked">
        <Switch />
      </Form.Item>

      {/* confirm_remove_all_tags 在 qBittorrent v5 已移除该偏好项，不再展示 */}

      <Form.Item label={tt('autoDeleteMode')} {...name('auto_delete_mode')}>
        <Select
          style={{ width: 200 }}
          options={[
            { label: tt('autoDeleteNever'), value: 0 },
            { label: tt('autoDeleteOlder'), value: 1 },
          ]}
        />
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('preallocate')}</Text>
      <Divider />

      <Form.Item label={tt('preallocate')} {...name('preallocate_all')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('incompleteExt')} {...name('incomplete_files_ext')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('categoryPathsManual')} {...name('use_category_paths_in_manual_mode')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('tmmTitle')}</Text>
      <Divider />

      <Form.Item label={tt('tmmTorrentChanged')} {...name('torrent_changed_tmm_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('tmmSavePathChanged')} {...name('save_path_changed_tmm_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('tmmCategoryChanged')} {...name('category_changed_tmm_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('autorunTitle')}</Text>
      <Divider />

      <Form.Item label={tt('autorunEnabled')} {...name('autorun_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(p, c) => p.autorun_enabled !== c.autorun_enabled}>
        {({ getFieldValue }) => (
          <Form.Item label={tt('autorunProgram')} {...name('autorun_program')} style={{ marginLeft: 24 }}>
            <Input disabled={!getFieldValue('autorun_enabled')} placeholder="/path/to/program" />
          </Form.Item>
        )}
      </Form.Item>

      <Form.Item label={tt('autorunEnabled')} {...name('autorun_on_torrent_added_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>
    </>
  )
}
