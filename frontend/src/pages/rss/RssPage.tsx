import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Key } from 'react'
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Space,
  Spin,
  Table,
  Tabs,
  Tooltip,
  Tree,
  TreeSelect,
  Typography,
} from 'antd'
import type { DataNode } from 'antd/es/tree'
import {
  CheckOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FilterOutlined,
  FolderAddOutlined,
  FolderOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { qbtApi, rssApi } from '@/services/api/client'
import { downloaderType } from '@/services/downloaders'
import type { RssArticle, RssFeedNode } from '@/services/types'
import { RssIcon } from '@/components/RssIcon'
import { useAppStore } from '@/stores/appStore'
import { formatDateTime } from '@/utils/format'
import RssRulesModal from './RssRulesModal'

const { Text } = Typography

/** 树根伪节点 key（聚合全部订阅的文章） */
const ROOT_KEY = '__all__'

/** TreeSelect 文件夹树节点 */
interface FolderOption {
  title: string
  value: string
  children: FolderOption[]
}

function findNode(nodes: RssFeedNode[], path: string): RssFeedNode | null {
  for (const n of nodes) {
    if (n.path === path) return n
    const hit = findNode(n.children, path)
    if (hit) return hit
  }
  return null
}

/** 收集节点自身及后代全部 feed */
function collectFeeds(node: RssFeedNode): RssFeedNode[] {
  if (!node.isFolder) return [node]
  return node.children.flatMap(collectFeeds)
}

/** 收集带子节点的文件夹路径（受控展开时自动展开新文件夹用） */
function collectParentKeys(nodes: RssFeedNode[]): string[] {
  return nodes.flatMap((n) =>
    n.children.length > 0 ? [n.path, ...collectParentKeys(n.children)] : [],
  )
}

function parentPath(path: string): string {
  const i = path.lastIndexOf('\\')
  return i === -1 ? '' : path.slice(0, i)
}

/** 文章时间：RFC 字符串或 epoch 秒 → 格式化（解析失败原样返回） */
function formatArticleDate(date: string): string {
  if (!date) return '-'
  const ms = Date.parse(date)
  const epoch = Number.isNaN(ms) ? Number(date) : ms / 1000
  return epoch > 0 ? formatDateTime(epoch) : date
}

export default function RssPage() {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()

  const allServers = useAppStore((s) => s.servers)
  const serversError = useAppStore((s) => s.serversError)
  const loadServers = useAppStore((s) => s.loadServers)
  const activeServerId = useAppStore((s) => s.activeServerId)
  const setActiveServerId = useAppStore((s) => s.setActiveServerId)
  // RSS 引擎是 qBittorrent 的能力（Transmission 无对应 RPC），仅列 qB 服务器
  const servers = allServers.filter((s) => downloaderType(s.type) === 'qbittorrent')

  const [tree, setTree] = useState<RssFeedNode[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  // 下载规则设置弹窗
  const [rulesOpen, setRulesOpen] = useState(false)

  // 添加订阅 / 新建文件夹 / 重命名 弹窗
  const [addFeedOpen, setAddFeedOpen] = useState(false)
  const [addFolderOpen, setAddFolderOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [feedUrl, setFeedUrl] = useState('')
  const [feedName, setFeedName] = useState('')
  const [folderName, setFolderName] = useState('')
  const [renameVal, setRenameVal] = useState('')
  const [parent, setParent] = useState('')

  // 重载时校验选中项是否仍存在，避免与 setSelectedPath 造成循环依赖
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedPath

  // 受控展开：defaultExpandAll 仅首次挂载生效，新增 feed 的文件夹需手动展开才可见。
  // 这里记住已见过的文件夹，重载时自动展开「新出现且带子节点」的文件夹，用户手动折叠不受影响。
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([ROOT_KEY])
  const seenFoldersRef = useRef<Set<string>>(new Set([ROOT_KEY]))

  useEffect(() => {
    void loadServers()
  }, [loadServers])

  const reload = useCallback(async () => {
    if (!activeServerId) return
    setLoading(true)
    setLoadError(null)
    try {
      const nodes = await rssApi.getFeeds(activeServerId)
      setTree(nodes)
      const cur = selectedRef.current
      if (!cur || cur === ROOT_KEY || !findNode(nodes, cur)) setSelectedPath(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [activeServerId])

  useEffect(() => {
    setSelectedPath(null)
    // 每台服务器的树独立展开（切换服务器回到全展开）
    seenFoldersRef.current = new Set([ROOT_KEY])
    setExpandedKeys([ROOT_KEY])
    void reload()
  }, [reload])

  // 树数据变化时自动展开「新出现且带子节点」的文件夹，用户手动折叠过的不再强展开
  useEffect(() => {
    const parentKeys = [ROOT_KEY, ...collectParentKeys(tree)]
    const fresh = parentKeys.filter((k) => !seenFoldersRef.current.has(k))
    if (fresh.length === 0) return
    fresh.forEach((k) => seenFoldersRef.current.add(k))
    setExpandedKeys((prev) => [...new Set([...prev, ...fresh])])
  }, [tree])

  const selected = useMemo(
    () => (selectedPath ? findNode(tree, selectedPath) : null),
    [tree, selectedPath],
  )

  // 文章列表：根伪节点或文件夹聚合后代 feed；feed 取自身；按时间倒序
  const articles = useMemo<RssArticle[]>(() => {
    if (!selected) {
      return tree.flatMap(collectFeeds).flatMap((f) => f.articles)
    }
    return (selected.isFolder ? selected.children.flatMap(collectFeeds) : [selected]).flatMap(
      (f) => f.articles,
    )
  }, [tree, selected])
  const sortedArticles = useMemo(
    () =>
      [...articles].sort((a, b) => {
        const ta = Date.parse(a.date)
        const tb = Date.parse(b.date)
        const ea = Number.isNaN(ta) ? Number(a.date) : ta / 1000
        const eb = Number.isNaN(tb) ? Number(b.date) : tb / 1000
        return eb - ea
      }),
    [articles],
  )

  const unreadCount = useCallback(
    (node: RssFeedNode): number =>
      collectFeeds(node).reduce((sum, f) => sum + f.articles.filter((a) => !a.isRead).length, 0),
    [],
  )

  /** 选中节点的父路径（新增订阅/文件夹的默认保存位置） */
  const defaultParent = selected
    ? selected.isFolder
      ? selected.path
      : parentPath(selected.path)
    : ''

  /** 供选择的文件夹树（根在前） */
  const folderOptions = useMemo(() => {
    const toOptions = (nodes: RssFeedNode[]): FolderOption[] =>
      nodes
        .filter((n) => n.isFolder)
        .map((n) => ({ title: n.name, value: n.path, children: toOptions(n.children) }))
    return [{ title: t('rss.root'), value: '', children: toOptions(tree) }]
  }, [tree, t])

  /** 订阅树（顶部追加「全部」伪节点聚合所有文章） */
  const treeData = useMemo<DataNode[]>(() => {
    const toNodes = (nodes: RssFeedNode[]): DataNode[] =>
      nodes.map((n) => {
        const unread = unreadCount(n)
        return {
          key: n.path,
          icon: n.isFolder ? <FolderOutlined /> : <RssIcon />,
          title: (
            <span>
              {n.hasError && <Text type="danger">{n.name}</Text>}
              {!n.hasError && n.name}
              {unread > 0 && (
                <Badge count={unread} size="small" style={{ marginLeft: 8, boxShadow: 'none' }} />
              )}
            </span>
          ),
          children: n.children.length > 0 ? toNodes(n.children) : undefined,
        }
      })
    const rootUnread = tree.reduce((sum, n) => sum + unreadCount(n), 0)
    return [
      {
        key: ROOT_KEY,
        icon: <RssIcon />,
        title: (
          <span>
            {t('rss.all')}
            {rootUnread > 0 && (
              <Badge count={rootUnread} size="small" style={{ marginLeft: 8, boxShadow: 'none' }} />
            )}
          </span>
        ),
        children: toNodes(tree),
      },
    ]
  }, [tree, t, unreadCount])

  /** 统一执行：成功提示 + 重载订阅树 */
  const run = async (action: () => Promise<unknown>, okMsg: string) => {
    setSubmitting(true)
    try {
      await action()
      message.success(okMsg)
      await reload()
      return true
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  const joinPath = (dir: string, name: string) => (dir ? `${dir}\\${name}` : name)

  /** 未填名称时按 URL 域名自动命名（qB 要求 path 含名称） */
  const autoName = (url: string) => {
    try {
      return new URL(url).hostname
    } catch {
      return url.slice(0, 60)
    }
  }

  const openAddFeed = () => {
    setFeedUrl('')
    setFeedName('')
    setParent(defaultParent)
    setAddFeedOpen(true)
  }

  const openAddFolder = () => {
    setFolderName('')
    setParent(defaultParent)
    setAddFolderOpen(true)
  }

  const openRename = () => {
    if (!selected) return
    setRenameVal(selected.name)
    setRenameOpen(true)
  }

  const submitAddFeed = async () => {
    const url = feedUrl.trim()
    if (!url) {
      message.warning(t('rss.feedUrlRequired'))
      return
    }
    const name = feedName.trim() || autoName(url)
    const ok = await run(
      () => rssApi.addFeed(activeServerId!, url, joinPath(parent, name)),
      t('rss.feedAdded'),
    )
    if (ok) setAddFeedOpen(false)
  }

  const submitAddFolder = async () => {
    const name = folderName.trim()
    if (!name) {
      message.warning(t('rss.nameRequired'))
      return
    }
    const ok = await run(
      () => rssApi.addFolder(activeServerId!, joinPath(parent, name)),
      t('rss.folderAdded'),
    )
    if (ok) setAddFolderOpen(false)
  }

  const submitRename = async () => {
    if (!selected) return
    const name = renameVal.trim()
    if (!name) {
      message.warning(t('rss.nameRequired'))
      return
    }
    if (name === selected.name) {
      setRenameOpen(false)
      return
    }
    const dest = joinPath(parentPath(selected.path), name)
    const ok = await run(
      () => rssApi.moveItem(activeServerId!, selected.path, dest),
      t('rss.renamed'),
    )
    if (ok) {
      setRenameOpen(false)
      setSelectedPath(dest)
    }
  }

  const confirmRemove = () => {
    if (!selected) return
    const node = selected
    modal.confirm({
      title: node.isFolder
        ? t('rss.removeFolderConfirm', { name: node.name })
        : t('rss.removeConfirm', { name: node.name }),
      okButtonProps: { danger: true },
      onOk: async () => {
        const ok = await run(() => rssApi.removeItem(activeServerId!, node.path), t('rss.removed'))
        if (ok) setSelectedPath(null)
      },
    })
  }

  /** 刷新订阅：refreshItem 立即返回，拉取在后台进行，稍等后重载列表 */
  const refreshSelected = async () => {
    if (!selected) return
    setRefreshing(true)
    try {
      await rssApi.refreshItem(activeServerId!, selected.path)
      message.success(t('rss.refreshed'))
      window.setTimeout(() => void reload(), 2500)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  /** 标记已读：feed 传自身路径；folder 展开为旗下全部 feed 逐个标记 */
  const markRead = () => {
    if (!selected) return
    const feeds = collectFeeds(selected)
    if (feeds.length === 0) return
    void run(
      () => Promise.all(feeds.map((f) => rssApi.markAsRead(activeServerId!, f.path))),
      t('rss.markedRead'),
    )
  }

  const downloadArticle = async (article: RssArticle) => {
    if (!article.torrentUrl) return
    setDownloadingId(article.id)
    try {
      await qbtApi.addTorrents(activeServerId!, { urls: article.torrentUrl })
      message.success(t('rss.downloaded'))
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setDownloadingId(null)
    }
  }

  // 与种子列表一致：未配置服务器时引导（仅有 Transmission 服务器时同样引导——RSS 仅 qB 支持）
  if (servers.length === 0) {
    const onlyTransmission = allServers.length > 0
    return (
      <Card>
        <Empty
          description={
            <div>
              <div>
                {onlyTransmission ? t('rss.requiresQbittorrent') : t('torrents.noServers')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
                {t('torrents.noServersHint')}
              </div>
            </div>
          }
        >
          <Button
            type="primary"
            icon={<SettingOutlined />}
            onClick={() => navigate('/settings/qbittorrent')}
          >
            {t('torrents.goSettings')}
          </Button>
        </Empty>
      </Card>
    )
  }

  return (
    <Card>
      {serversError && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }} message={serversError} />
      )}

      {/* Server Tabs：一个 tab 一台服务器 */}
      <Tabs
        activeKey={activeServerId ?? undefined}
        onChange={(k) => {
          setActiveServerId(k)
        }}
        items={servers.map((s) => ({ key: s.id, label: s.name }))}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <Space wrap>
          <Button type="primary" icon={<RssIcon />} onClick={openAddFeed}>
            {t('rss.addFeed')}
          </Button>
          <Button icon={<FolderAddOutlined />} onClick={openAddFolder}>
            {t('rss.addFolder')}
          </Button>
          <Button icon={<FilterOutlined />} onClick={() => setRulesOpen(true)}>
            {t('rss.rules.settings')}
          </Button>
          {selected && (
            <>
              <Button
                icon={<ReloadOutlined />}
                loading={refreshing}
                onClick={() => void refreshSelected()}
              >
                {t('rss.refresh')}
              </Button>
              <Button icon={<CheckOutlined />} onClick={markRead}>
                {t('rss.markRead')}
              </Button>
              <Button icon={<EditOutlined />} onClick={openRename}>
                {t('rss.rename')}
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={confirmRemove}>
                {t('rss.remove')}
              </Button>
            </>
          )}
        </Space>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void reload()}>
          {t('rss.reload')}
        </Button>
      </div>

      {loadError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={loadError}
          action={
            <Button size="small" onClick={() => void reload()}>
              {t('common.retry')}
            </Button>
          }
        />
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        {/* 左：订阅树 */}
        <Card size="small" style={{ width: 280, flexShrink: 0 }} styles={{ body: { padding: '8px 4px' } }}>
          {loading && tree.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <Spin />
            </div>
          ) : tree.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <div>{t('rss.noFeeds')}</div>
                  <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
                    {t('rss.noFeedsHint')}
                  </div>
                </div>
              }
            />
          ) : (
            <Tree
              blockNode
              showIcon
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpandedKeys(keys)}
              selectedKeys={[selectedPath ?? ROOT_KEY]}
              onSelect={(keys) => {
                const key = keys[0]
                setSelectedPath(key === undefined || key === ROOT_KEY ? null : String(key))
              }}
              treeData={treeData}
            />
          )}
        </Card>

        {/* 右：文章列表 */}
        <Card size="small" style={{ flex: 1, minWidth: 0 }}>
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            dataSource={sortedArticles}
            pagination={{ pageSize: 50, showSizeChanger: false, hideOnSinglePage: true }}
            // 超长标题会撑爆 auto 布局（发布时间/操作列被挤出容器），fixed 布局下
            // 无宽度的标题列瓜分剩余空间，配合列级 ellipsis 截断
            tableLayout="fixed"
            locale={{
              emptyText: selected ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.empty')} /> : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('rss.noSelection')} />
              ),
            }}
            columns={[
              {
                title: t('rss.col.title'),
                dataIndex: 'title',
                key: 'title',
                // 单元格级截断（td 上加 ellipsis 类）；Tooltip 仅显示完整标题，
                // showTitle:false 关掉原生 title 避免双提示（与种子列表一致）
                ellipsis: { showTitle: false },
                render: (_, a) => (
                  <Tooltip title={a.title} mouseEnterDelay={0.2}>
                    <span style={{ fontWeight: !a.isRead ? 600 : 400 }}>
                      {a.link ? (
                        <a href={a.link} target="_blank" rel="noreferrer">
                          {a.title}
                        </a>
                      ) : (
                        a.title
                      )}
                    </span>
                  </Tooltip>
                ),
              },
              {
                title: t('rss.col.date'),
                dataIndex: 'date',
                key: 'date',
                width: 170,
                render: (d: string) => <Text type="secondary">{formatArticleDate(d)}</Text>,
              },
              {
                title: t('rss.col.actions'),
                key: 'actions',
                width: 100,
                render: (_, a) => (
                  <Button
                    size="small"
                    type="link"
                    icon={<DownloadOutlined />}
                    disabled={!a.torrentUrl}
                    loading={downloadingId === a.id}
                    onClick={() => void downloadArticle(a)}
                  >
                    {t('rss.download')}
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      </div>

      {/* 添加订阅 */}
      <Modal
        open={addFeedOpen}
        title={t('rss.addFeedTitle')}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={submitting}
        onOk={() => void submitAddFeed()}
        onCancel={() => setAddFeedOpen(false)}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text strong>{t('rss.feedUrl')}</Text>
          <Input
            autoFocus
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder={t('rss.feedUrlPh')}
            onPressEnter={() => void submitAddFeed()}
          />
          <Text strong>{t('rss.name')}</Text>
          <Input
            value={feedName}
            onChange={(e) => setFeedName(e.target.value)}
            placeholder={t('rss.namePh')}
          />
          <Text strong>{t('rss.parent')}</Text>
          <TreeSelect
            style={{ width: '100%' }}
            value={parent}
            onChange={setParent}
            treeDefaultExpandAll
            treeData={folderOptions}
          />
        </Space>
      </Modal>

      {/* 新建文件夹 */}
      <Modal
        open={addFolderOpen}
        title={t('rss.addFolderTitle')}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={submitting}
        onOk={() => void submitAddFolder()}
        onCancel={() => setAddFolderOpen(false)}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text strong>{t('rss.name')}</Text>
          <Input
            autoFocus
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder={t('rss.folderNamePh')}
            onPressEnter={() => void submitAddFolder()}
          />
          <Text strong>{t('rss.parent')}</Text>
          <TreeSelect
            style={{ width: '100%' }}
            value={parent}
            onChange={setParent}
            treeDefaultExpandAll
            treeData={folderOptions}
          />
        </Space>
      </Modal>

      {/* 重命名 */}
      <Modal
        open={renameOpen}
        title={t('rss.renameTitle')}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={submitting}
        onOk={() => void submitRename()}
        onCancel={() => setRenameOpen(false)}
        destroyOnHidden
      >
        <Input
          autoFocus
          value={renameVal}
          onChange={(e) => setRenameVal(e.target.value)}
          onPressEnter={() => void submitRename()}
        />
      </Modal>

      {/* 下载规则设置（按当前服务器） */}
      <RssRulesModal
        open={rulesOpen}
        serverId={activeServerId ?? ''}
        feeds={tree}
        onClose={() => setRulesOpen(false)}
      />
    </Card>
  )
}
