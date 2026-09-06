import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  App,
  Button,
  Checkbox,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { blankRssRule, rssApi } from '@/services/api/client'
import type { RssFeedNode, RssRule } from '@/services/types'
import { useServerTaxonomy } from '@/hooks/useServerTaxonomy'

const { Text } = Typography

interface Props {
  open: boolean
  serverId: string
  /** 父页面订阅树：作用订阅源下拉选项（value 为 feed URL） */
  feeds: RssFeedNode[]
  onClose: () => void
}

/** 表单值：RssRule 去掉只读/内部字段 */
type RuleFormValues = Omit<RssRule, 'raw' | 'lastMatch'>

/** 展平订阅树为 feed 列表（folder 丢弃） */
function flattenFeeds(nodes: RssFeedNode[]): RssFeedNode[] {
  return nodes.flatMap((n) => (n.isFolder ? flattenFeeds(n.children) : [n]))
}

export default function RssRulesModal({ open, serverId, feeds, onClose }: Props) {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const taxonomy = useServerTaxonomy(open ? serverId : null)
  const [form] = Form.useForm<RuleFormValues>()

  const [rules, setRules] = useState<RssRule[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<RssRule | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(
    async (selectName?: string) => {
      if (!serverId) return
      setLoading(true)
      try {
        const list = await rssApi.getRules(serverId)
        setRules(list)
        const target =
          selectName !== undefined ? list.find((r) => r.name === selectName) : undefined
        setSelected(target ?? list[0] ?? null)
      } catch (err) {
        message.error(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [serverId, message],
  )

  useEffect(() => {
    if (open) void reload()
    else {
      setRules([])
      setSelected(null)
    }
  }, [open, reload])

  // 选中变化时把规则写入表单（resetFields 先清 touched，脏检查依赖它）
  useEffect(() => {
    if (!selected) return
    form.resetFields()
    const { raw: _raw, lastMatch: _lastMatch, ...values } = selected
    form.setFieldsValue({ ...values, assignedCategory: selected.assignedCategory || undefined })
  }, [selected, form])

  /** 切换选中规则；有未保存修改时先确认 */
  const selectRule = (rule: RssRule) => {
    if (rule.name === selected?.name) return
    // 无参 = some 语义（任一字段被动过）；传 true 是 every 语义，漏判脏表单
    if (form.isFieldsTouched()) {
      modal.confirm({
        title: t('rss.rules.unsavedTitle'),
        content: t('rss.rules.unsavedContent'),
        okText: t('rss.rules.discard'),
        cancelText: t('common.cancel'),
        onOk: () => setSelected(rule),
      })
      return
    }
    setSelected(rule)
  }

  /** 新建：自动去重命名后直接创建（与 qB 官方行为一致），再进入编辑 */
  const createRule = async () => {
    if (!serverId) return
    const base = t('rss.rules.newRuleName')
    const names = new Set(rules.map((r) => r.name))
    let name = base
    for (let i = 2; names.has(name); i++) name = `${base} ${i}`
    setSaving(true)
    try {
      await rssApi.setRule(serverId, name, blankRssRule(name))
      message.success(t('rss.rules.created'))
      await reload(name)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  /** 保存：名称变更时先 renameRule 再以新名 setRule（全量替换） */
  const handleSave = async (values: RuleFormValues) => {
    if (!serverId || !selected) return
    setSaving(true)
    try {
      if (values.name !== selected.name) {
        await rssApi.renameRule(serverId, selected.name, values.name)
      }
      await rssApi.setRule(serverId, values.name, { ...selected, ...values })
      message.success(t('rss.rules.saved'))
      await reload(values.name)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
      // 重命名可能已生效而后续保存失败，重载避免列表与服务器脱节
      if (values.name !== selected.name) void reload(values.name)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = (rule: RssRule) => {
    modal.confirm({
      title: t('rss.rules.deleteConfirm', { name: rule.name }),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await rssApi.removeRule(serverId, rule.name)
          message.success(t('rss.rules.removed'))
          await reload()
        } catch (err) {
          message.error(err instanceof Error ? err.message : String(err))
        }
      },
    })
  }

  const feedOptions = useMemo(
    () => flattenFeeds(feeds).map((f) => ({ label: f.path, value: f.url })),
    [feeds],
  )
  const categoryOptions = useMemo(
    () => taxonomy.categories.map((c) => ({ label: c, value: c })),
    [taxonomy.categories],
  )
  const pausedOptions = useMemo(
    () => [
      { label: t('rss.rules.global'), value: null },
      { label: t('rss.rules.pausedYes'), value: true },
      { label: t('rss.rules.pausedNo'), value: false },
    ],
    [t],
  )
  const layoutOptions = useMemo(
    () => [
      { label: t('rss.rules.global'), value: null },
      { label: t('rss.rules.layoutOriginal'), value: 'Original' },
      { label: t('rss.rules.layoutSubfolder'), value: 'Subfolder' },
      { label: t('rss.rules.layoutNoSubfolder'), value: 'NoSubfolder' },
    ],
    [t],
  )

  return (
    <Modal
      open={open}
      title={t('rss.rules.title')}
      width={920}
      destroyOnHidden
      onCancel={onClose}
      footer={[
        <Button
          key="save"
          type="primary"
          loading={saving}
          disabled={!selected}
          onClick={() => form.submit()}
        >
          {t('common.save')}
        </Button>,
        <Button key="close" onClick={onClose}>
          {t('common.cancel')}
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', gap: 16, minHeight: 420 }}>
        {/* 左：规则列表 */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <Button
            type="primary"
            size="small"
            block
            icon={<PlusOutlined />}
            style={{ marginBottom: 8 }}
            onClick={() => void createRule()}
          >
            {t('rss.rules.newRule')}
          </Button>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <Spin />
            </div>
          ) : rules.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <div>{t('rss.rules.noRules')}</div>
                  <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
                    {t('rss.rules.noRulesHint')}
                  </div>
                </div>
              }
            />
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {rules.map((r) => {
                const active = r.name === selected?.name
                return (
                  <div
                    key={r.name}
                    onClick={() => selectRule(r)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: active ? 'var(--ant-color-fill-secondary)' : undefined,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Text strong={active} ellipsis style={{ flex: 1, minWidth: 0 }}>
                          {r.name}
                        </Text>
                        {!r.enabled && <Tag style={{ marginRight: 0 }}>{t('rss.rules.disabled')}</Tag>}
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('rss.rules.lastMatch')}: {r.lastMatch || t('rss.rules.never')}
                      </Text>
                    </div>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => {
                        e.stopPropagation()
                        confirmDelete(r)
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 右：编辑表单 */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', maxHeight: 520 }}>
          {selected ? (
            <Form
              form={form}
              layout="vertical"
              size="small"
              onFinish={(v) => void handleSave(v)}
              style={{ paddingTop: 4 }}
            >
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    name="name"
                    label={t('rss.rules.name')}
                    rules={[{ required: true, message: t('rss.rules.nameRequired') }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="enabled"
                    label={t('rss.rules.enabled')}
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="mustContain" label={t('rss.rules.mustContain')}>
                    <Input allowClear />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="mustNotContain" label={t('rss.rules.mustNotContain')}>
                    <Input allowClear />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Space wrap>
                    <Form.Item name="useRegex" valuePropName="checked" noStyle>
                      <Checkbox>{t('rss.rules.useRegex')}</Checkbox>
                    </Form.Item>
                    <Form.Item name="smartFilter" valuePropName="checked" noStyle>
                      <Checkbox>{t('rss.rules.smartFilter')}</Checkbox>
                    </Form.Item>
                  </Space>
                </Col>
                <Col span={12}>
                  <Form.Item name="episodeFilter" label={t('rss.rules.episodeFilter')}>
                    <Input allowClear placeholder="s01e02" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="assignedCategory" label={t('rss.rules.category')}>
                    <Select allowClear showSearch options={categoryOptions} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="savePath" label={t('rss.rules.savePath')}>
                    <Input allowClear />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="addPaused" label={t('rss.rules.addPaused')}>
                    <Select options={pausedOptions} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="torrentContentLayout" label={t('rss.rules.contentLayout')}>
                    <Select options={layoutOptions} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="affectedFeeds" label={t('rss.rules.affectedFeeds')}>
                    <Select
                      mode="multiple"
                      allowClear
                      maxTagCount="responsive"
                      placeholder={t('rss.rules.affectedFeedsPh')}
                      options={feedOptions}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('rss.rules.noSelection')} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
