import { useEffect, useState } from 'react'
import { Modal, Form, Radio, Input, Upload, Switch, InputNumber, Collapse, App, Row, Col, Divider, Select } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { qbtApi, type AddTorrentParams, type QbtCategory, type ServerConfig } from '@/services/api/client'
import { supports } from '@/services/downloaders'
import { torrentOps } from '@/services/api/torrentOps'
import { DirPathInput } from '@/components/DirPathInput'
import type { FormItemProps, UploadFile } from 'antd'
import type { RcFile } from 'antd/es/upload'

interface Props {
  open: boolean
  onClose: () => void
  server: ServerConfig
}

type AddMode = 'url' | 'file'

interface FormValues {
  urls?: string
  /** Upload fileList（getValueFromEvent 已把 onChange 转成数组） */
  torrents?: UploadFile[]
  savepath?: string
  category?: string
  tags?: string[]
  paused?: boolean
  skipChecking?: boolean
  rootFolder?: boolean
  rename?: string
  upLimit?: number
  dlLimit?: number
  ratioLimit?: number
  seedingTimeLimit?: number
  autoTMM?: boolean
  sequentialDownload?: boolean
  firstLastPiecePrio?: boolean
}

function mapFormToParams(values: FormValues): AddTorrentParams {
  const params: AddTorrentParams = {}

  // URLs
  if (values.urls?.trim()) {
    params.urls = values.urls.trim()
  }

  // Files
  const fileList = values.torrents
  if (fileList?.length) {
    params.torrents = fileList
      .map((f) => f.originFileObj)
      .filter((f): f is RcFile => !!f)
  }

  // Optional fields — only set if non-empty
  if (values.savepath?.trim()) params.savepath = values.savepath.trim()
  if (values.category?.trim()) params.category = values.category.trim()
  if (values.tags?.length) params.tags = values.tags.join(',')
  if (values.rename?.trim()) params.rename = values.rename.trim()
  if (values.paused) params.paused = true
  if (values.skipChecking) params.skipChecking = true
  if (values.rootFolder !== undefined) params.rootFolder = values.rootFolder
  if (values.autoTMM !== undefined) params.autoTMM = values.autoTMM
  if (values.sequentialDownload) params.sequentialDownload = true
  if (values.firstLastPiecePrio) params.firstLastPiecePrio = true
  if (values.upLimit) params.upLimit = values.upLimit * 1024 // KiB/s → B/s
  if (values.dlLimit) params.dlLimit = values.dlLimit * 1024
  if (values.ratioLimit) params.ratioLimit = values.ratioLimit
  if (values.seedingTimeLimit) params.seedingTimeLimit = values.seedingTimeLimit

  return params
}

/**
 * 高级区横排项统一布局：固定 label 列宽（antd 横排 label 默认右对齐）+ 控件列等宽对齐、输入框等宽；
 * label 超宽由 Form 级 labelWrap 换行兜底（antd 默认 nowrap 直接截断），新增文案仍应保持简短
 */
const HORIZONTAL_ITEM = {
  layout: 'horizontal',
  labelCol: { span: 11 },
  wrapperCol: { span: 13 },
} as const

/** 高级区表单项统一容器：横排属性集中在此，勿在单个 Form.Item 上散写 labelCol/wrapperCol/间距 */
function HorizontalFormItem({ style, ...rest }: FormItemProps) {
  // 行距 12：换行 label（如英文长文案）与下一行之间仍留有明显间隙
  return <Form.Item {...HORIZONTAL_ITEM} style={{ marginBottom: 12, ...style }} {...rest} />
}

export default function AddTorrentModal({ open, onClose, server }: Props) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const tt = (k: string) => t(`torrents.${k}`)
  const serverId = server.id
  const [form] = Form.useForm<FormValues>()
  // 默认走文件上传（.torrent 拖拽最常用）；URL 模式手动切换
  const [mode, setMode] = useState<AddMode>('file')
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<QbtCategory[]>([])
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const ops = torrentOps(server)
  const can = (f: Parameters<typeof supports>[1]) => supports(server, f)

  // 弹窗打开时按目标服务器加载分类/标签下拉选项；失败静默降级为空列表，不阻塞添加流程。
  // 仅 qB 需要拉取（tr 标签无需注册表，自由输入写入 labels）
  useEffect(() => {
    if (!open || !serverId) return
    if (!can('categories') && !can('tagRegistry')) return
    let cancelled = false
    void Promise.allSettled([qbtApi.getCategories(serverId), qbtApi.getTags(serverId)]).then(
      ([cats, tags]) => {
        if (cancelled) return
        setCategories(cats.status === 'fulfilled' ? cats.value : [])
        setTagOptions(tags.status === 'fulfilled' ? tags.value : [])
      },
    )
    return () => {
      cancelled = true
    }
  }, [open, serverId])

  const handleClose = () => {
    form.resetFields()
    setMode('file')
    onClose()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const params = mapFormToParams(values)

      // At least one source required
      if (!params.urls && (!params.torrents || params.torrents.length === 0)) {
        message.warning(mode === 'url' ? tt('urlsPlaceholder') : tt('uploadTorrent'))
        return
      }

      setLoading(true)
      const res = await ops.addTorrents(params)
      if (res.duplicate) {
        message.warning(tt('addDuplicate'))
      } else {
        message.success(tt('addSuccess'))
      }
      handleClose()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return // form validation error
      message.error(`${tt('addFailed')}: ${(err as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  // TMM 开启时 qB 忽略 savepath（按分类/默认路径落盘），与 qB WebUI 一致置灰路径输入
  const tmmOn = Form.useWatch('autoTMM', form) === true

  const advancedItems = [
    {
      key: 'advanced',
      label: tt('advancedOptions'),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* 路径 / 分类 / 标签 / 重命名 (2 列)；分类、重命名仅 qB 支持（tr 隐藏对应项） */}
          <Row gutter={8}>
            <Col span={12}>
              <HorizontalFormItem name="savepath" label={tt('savePath')}>
                <DirPathInput serverId={serverId} allowClear disabled={tmmOn} />
              </HorizontalFormItem>
            </Col>
            {can('categories') && (
              <Col span={12}>
                <HorizontalFormItem name="category" label={tt('category')}>
                  {/* 标准单选下拉，选项取当前服务器的 qB 分类 */}
                  <Select
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    options={categories.map((c) => ({ value: c.name, label: c.name }))}
                  />
                </HorizontalFormItem>
              </Col>
            )}
            <Col span={12}>
              <HorizontalFormItem name="tags" label={tt('tags')}>
                {/* 多选下拉，选项取当前服务器的 qB 标签；支持输入新标签（qB 自动创建 / tr 写入 labels）与逗号粘贴分词 */}
                <Select
                  mode="tags"
                  allowClear
                  style={{ width: '100%' }}
                  options={tagOptions.map((tag) => ({ value: tag, label: tag }))}
                  tokenSeparators={[',']}
                />
              </HorizontalFormItem>
            </Col>
            {can('rename') && (
              <Col span={12}>
                <HorizontalFormItem name="rename" label={tt('rename')}>
                  <Input allowClear  />
                </HorizontalFormItem>
              </Col>
            )}
          </Row>

          <Divider style={{ margin: '4px 0' }} />

          {/* 行为开关 (2 列)；按下载器能力隐藏不支持的开关 */}
          <Row gutter={8}>
            {can('autoTMM') && (
              <Col span={12}>
                <HorizontalFormItem name="autoTMM" label={tt('autoTMM')} valuePropName="checked">
                  <Switch/>
                </HorizontalFormItem>
              </Col>
            )}
            <Col span={12}>
              <HorizontalFormItem name="paused" label={tt('addPaused')} valuePropName="checked">
                <Switch />
              </HorizontalFormItem>
            </Col>
            {can('skipChecking') && (
              <Col span={12}>
                <HorizontalFormItem
                  name="skipChecking"
                  label={tt('skipChecking')}
                  valuePropName="checked"
                >
                  <Switch/>
                </HorizontalFormItem>
              </Col>
            )}
            {can('rootFolder') && (
              <Col span={12}>
                <HorizontalFormItem
                  name="rootFolder"
                  label={tt('rootFolder')}
                  valuePropName="checked"
                >
                  <Switch />
                </HorizontalFormItem>
              </Col>
            )}
            {can('sequentialDownload') && (
              <Col span={12}>
                <HorizontalFormItem
                  name="sequentialDownload"
                  label={tt('sequentialDownload')}
                  valuePropName="checked"
                >
                  <Switch />
                </HorizontalFormItem>
              </Col>
            )}
            {can('firstLastPiecePrio') && (
              <Col span={12}>
                <HorizontalFormItem
                  name="firstLastPiecePrio"
                  label={tt('firstLastPiecePrio')}
                  valuePropName="checked"
                >
                  <Switch />
                </HorizontalFormItem>
              </Col>
            )}
          </Row>

          <Divider style={{ margin: '4px 0' }} />

          {/* 数值限制 (2 列)；分享率 qB/tr 均支持（tr 添加后经 torrent-set 下发）；
              做种时限仅 qB（tr 闲置做种语义不同，不提供） */}
          <Row gutter={8}>
            <Col span={12}>
              <HorizontalFormItem name="dlLimit" label={tt('dlLimitField')}>
                <InputNumber
                  min={0}
                  style={{ width: '100%' }}
                  suffix={tt('unitSpeed')}
                />
              </HorizontalFormItem>
            </Col>
            <Col span={12}>
              <HorizontalFormItem name="upLimit" label={tt('upLimitField')}>
                <InputNumber
                  min={0}
                  style={{ width: '100%' }}
                  suffix={tt('unitSpeed')}
                />
              </HorizontalFormItem>
            </Col>
            {/* 分享率：qB 原生支持；tr 的 torrent_add 不带该参数，由后端添加成功后 torrent-set 下发 */}
            {can('addRatioLimit') && (
              <Col span={12}>
                <HorizontalFormItem name="ratioLimit" label={tt('ratioLimitField')}>
                  <InputNumber min={-1} step={0.1} style={{ width: '100%' }} />
                </HorizontalFormItem>
              </Col>
            )}
            {can('addSeedingTimeLimit') && (
              <Col span={12}>
                <HorizontalFormItem name="seedingTimeLimit" label={tt('seedingTimeLimitField')}>
                  <InputNumber
                    min={-1}
                    style={{ width: '100%' }}
                    suffix={tt('unitMinute')}
                  />
                </HorizontalFormItem>
              </Col>
            )}
          </Row>
        </div>
      ),
    },
  ]

  return (
    <Modal
      title={server.name ? `${tt('addTorrent')} · ${server.name}` : tt('addTorrent')}
      open={open}
      onCancel={handleClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      destroyOnHidden
      width={720}
    >
      <Form form={form} layout="vertical" initialValues={{ autoTMM: true }} labelWrap style={{ marginTop: 16 }}>
        <Form.Item>
          <Radio.Group size={'medium'} value={mode} onChange={(e) => setMode(e.target.value)}>
            <Radio.Button value="file">{tt('addModeFile')}</Radio.Button>
            <Radio.Button value="url">{tt('addModeUrl')}</Radio.Button>
          </Radio.Group>
        </Form.Item>

        {mode === 'url' ? (
          <Form.Item name="urls">
            <Input.TextArea
              rows={4}
              placeholder={tt('urlsPlaceholder')}
              autoSize={{ minRows: 3, maxRows: 8 }}
            />
          </Form.Item>
        ) : (
          <Form.Item name="torrents" valuePropName="fileList" getValueFromEvent={(e) => (Array.isArray(e) ? e : e?.fileList)}>
            <Upload.Dragger accept=".torrent" multiple beforeUpload={() => false}>
              <p style={{ fontSize: 32, color: '#999', marginBottom: 8 }}>
                <InboxOutlined />
              </p>
              <p>{tt('uploadTorrent')}</p>
            </Upload.Dragger>
          </Form.Item>
        )}

        {/* 高级选项默认展开——路径/分类等常用项免一次点击 */}
        <Collapse ghost items={advancedItems} defaultActiveKey={['advanced']} />
      </Form>
    </Modal>
  )
}
