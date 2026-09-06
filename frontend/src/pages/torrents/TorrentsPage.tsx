import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Card, Tabs, Input, Select, Button, Space, Table, Tag, App, Checkbox, Alert, Empty } from 'antd'
import { SearchOutlined, PauseOutlined, PlayCircleOutlined, ReloadOutlined, DeleteOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useTorrentStore } from '@/stores/torrentStore'
import { useAppStore, type TorrentColumnPrefs } from '@/stores/appStore'
import { torrentOps } from '@/services/api/torrentOps'
import { capsOf } from '@/services/downloaders'
import { refreshServer } from '@/hooks/useTorrentPolling'
import { splitTags } from '@/utils/misc'
import { useTorrentFilters, UNCATEGORIZED, UNTAGGED } from '@/hooks/useTorrentFilters'
import { useServerTaxonomy } from '@/hooks/useServerTaxonomy'
import { TORRENT_FILTER_KEYS, torrentFilterI18nKey, type TorrentFilterKey } from '@/services/status'
import type { Torrent } from '@/services/types'
import { DEFAULT_VISIBLE_KEYS, DEFAULT_ORDER, buildColumns } from './columns'
import ColumnSettings from './ColumnSettings'
import TorrentDetailDrawer from './TorrentDetailDrawer'
import AddTorrentModal from './AddTorrentModal'
import { TorrentContextMenu } from './TorrentContextMenu'

export default function TorrentsPage() {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()

  const serverData = useTorrentStore((s) => s.serverData)
  const torrentColumns = useAppStore((s) => s.torrentColumns)
  const setTorrentColumns = useAppStore((s) => s.setTorrentColumns)
  const servers = useAppStore((s) => s.servers)
  const activeServerId = useAppStore((s) => s.activeServerId)
  const setActiveServerId = useAppStore((s) => s.setActiveServerId)

  // 单服务器视图：只读当前服务器的分片
  const currentData = activeServerId ? serverData[activeServerId] : undefined
  const torrents = useMemo(() => currentData?.torrents ?? [], [currentData])
  const activeServer = useMemo(() => servers.find((s) => s.id === activeServerId), [servers, activeServerId])
  const caps = capsOf(activeServer?.type)
  const { filters, setFilters, filteredTorrents, trackerDomains, resetServerScopedFilters } =
    useTorrentFilters(torrents)
  // 分类/标签下拉数据源：服务器定义全集（而非仅当前种子中出现过的）；
  // Transmission 无注册表，标签从当前种子的 labels 并集派生
  const trTagOptions = useMemo(() => {
    const set = new Set<string>()
    for (const t of torrents) {
      for (const tag of splitTags(t.tags)) set.add(tag)
    }
    return [...set]
  }, [torrents])
  const taxonomy = useServerTaxonomy(activeServerId, {
    skipFetch: !caps.has('tagRegistry'),
    fallbackTags: trTagOptions,
  })

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [drawerTorrent, setDrawerTorrent] = useState<Torrent | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  // 右键菜单状态。目标集在右键瞬间冻结成快照：轮询每 2s 生成全新 torrent 对象，
  // 若菜单直接引用实时数据，items 会随轮询重建、DOM 节点被替换，正在进行的点击会落空。
  // pos 为光标视口坐标，传给菜单做定点锚，让菜单在鼠标位置弹出。
  const [ctx, setCtx] = useState<{ anchor: Torrent; targets: Torrent[]; pos: { x: number; y: number } } | null>(null)
  // 静态 confirm 弹窗内容不随本组件重渲染，“同时删除文件”勾选态走 ref 读取
  const deleteFilesRef = useRef(false)

  // 切换服务器后旧选中行的 hash 属于上一台服务器，必须清空避免误操作；
  // 分类/标签/Tracker 筛选与旧服务器绑定，一并重置（保留名称搜索与状态筛选）
  useEffect(() => {
    setSelectedRowKeys([])
    setCtx(null)
    resetServerScopedFilters()
  }, [activeServerId, resetServerScopedFilters])

  // 列配置：优先使用持久化偏好，否则用默认值
  const visibleKeys = torrentColumns?.visible ?? DEFAULT_VISIBLE_KEYS
  const orderKeys = torrentColumns?.order ?? DEFAULT_ORDER

  const handleColumnChange = useCallback(
    (prefs: TorrentColumnPrefs) => {
      setTorrentColumns(prefs)
    },
    [setTorrentColumns],
  )

  /** 执行动作并立即刷新当前服务器；失败弹错 */
  const runServerAction = async (action: () => Promise<void>, successMsg?: string) => {
    if (!activeServerId) return
    try {
      await action()
      if (successMsg) message.success(successMsg)
      void refreshServer(activeServerId)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    }
  }

  const handleBatchAction = async (action: 'pause' | 'resume' | 'recheck' | 'delete') => {
    const hashes = selectedRowKeys as string[]
    if (hashes.length === 0) {
      message.warning(t('torrents.selectFirst'))
      return
    }
    if (!activeServerId) return

    if (action === 'delete') {
      deleteFilesRef.current = false
      modal.confirm({
        title: t('torrents.confirmDelete', { count: hashes.length }),
        content: (
          <div style={{ marginTop: 8 }}>
            {/* 非受控：confirm 内容不重渲染，勾选态由 onChange 写 ref */}
            <Checkbox defaultChecked={false} onChange={(e) => (deleteFilesRef.current = e.target.checked)}>
              {t('torrents.deleteFiles')}
            </Checkbox>
          </div>
        ),
        okButtonProps: { danger: true },
        onOk: async () => {
          await runServerAction(
            () => torrentOps(activeServer!).remove(hashes, deleteFilesRef.current),
            `${t('common.delete')} ${hashes.length}`,
          )
          setSelectedRowKeys([])
        },
      })
      return
    }

    const ops = torrentOps(activeServer!)
    const api =
      action === 'pause'
        ? () => ops.stop(hashes)
        : action === 'resume'
          ? () => ops.start(hashes)
          : () => ops.recheck(hashes)

    await runServerAction(api, `${t(`torrents.batch${action.charAt(0).toUpperCase() + action.slice(1)}`)} ${hashes.length}`)
    setSelectedRowKeys([])
  }

  const columns = buildColumns(t, visibleKeys, orderKeys, setDrawerTorrent, caps)

  // 虚拟表格要求 scroll.x 必须为数值：'max-content' 会被 rc-table 静默钳成 1，
  // 横向滚动整体失效（中间列被裁掉、fixed 列贴边错乱）。这里按可见列宽求和，
  // +40 为行选择复选框列宽。
  const scrollX = useMemo(
    () => columns.reduce((sum, col) => sum + Number(col.width ?? 0), 0) + 40,
    [columns],
  )

  // 尚未配置任何服务器（或后端尚未连上）：引导去设置页，与 RSS 订阅页一致
  if (servers.length === 0) {
    return (
      <Card>
        <Empty
          description={
            <div>
              <div>{t('torrents.noServers')}</div>
              <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>{t('torrents.noServersHint')}</div>
            </div>
          }
        >
          <Button type="primary" icon={<SettingOutlined />} onClick={() => navigate('/settings/qbittorrent')}>
            {t('torrents.goSettings')}
          </Button>
        </Empty>
      </Card>
    )
  }

  return (
    <Card>
      {/* 当前服务器连接异常：展示错误 + 重试/前往设置，表格保留旧数据 */}
      {currentData?.error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${currentServerName(servers, activeServerId)} · ${t('torrents.serverError')}`}
          description={currentData.error}
          action={
            <Space>
              <Button size="small" onClick={() => void refreshServer(activeServerId!)}>
                {t('common.retry')}
              </Button>
              <Button size="small" icon={<SettingOutlined />} onClick={() => navigate('/settings/qbittorrent')}>
                {t('torrents.goSettings')}
              </Button>
            </Space>
          }
        />
      )}

      {/* Server Tabs：一个 tab 一台服务器 */}
      <Tabs
        activeKey={activeServerId ?? undefined}
        onChange={setActiveServerId}
        items={servers.map((s) => ({ key: s.id, label: s.name }))}
      />

      {/* Toolbar: search left, filters right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <Input
          placeholder={t('torrents.searchPlaceholder')}
          prefix={<SearchOutlined />}
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          style={{ width: 260 }}
          allowClear
        />
        <Space wrap>
          {/* 状态：qB /torrents/info filter 枚举，多选 */}
          <Select
            mode="multiple"
            placeholder={t('torrents.filterStatus')}
            value={filters.statuses}
            onChange={(vals) => setFilters((f) => ({ ...f, statuses: (vals ?? []) as TorrentFilterKey[] }))}
            style={{ width: 180 }}
            maxTagCount="responsive"
            allowClear
            options={TORRENT_FILTER_KEYS.map((key) => ({ label: t(torrentFilterI18nKey(key)), value: key }))}
          />
          {/* 分类：服务器定义的分类全集 + 「未分类」，多选；tr 无分类概念，隐藏 */}
          {caps.has('categories') && (
            <Select
              mode="multiple"
              placeholder={t('torrents.filterCategory')}
              value={filters.categories}
              onChange={(vals) => setFilters((f) => ({ ...f, categories: vals ?? [] }))}
              style={{ width: 180 }}
              maxTagCount="responsive"
              allowClear
              options={[
                { label: t('torrents.uncategorized'), value: UNCATEGORIZED },
                ...taxonomy.categories.map((c) => ({ label: c, value: c })),
              ]}
            />
          )}
          {/* 标签：服务器定义的标签全集 + 「无标签」，多选 */}
          <Select
            mode="multiple"
            placeholder={t('torrents.filterTag')}
            value={filters.tags}
            onChange={(vals) => setFilters((f) => ({ ...f, tags: vals ?? [] }))}
            style={{ width: 180 }}
            maxTagCount="responsive"
            allowClear
            options={[
              { label: t('torrents.untagged'), value: UNTAGGED },
              ...taxonomy.tags.map((tag) => ({ label: tag, value: tag })),
            ]}
          />
          {/* Tracker：按域名过滤（域名取自当前服务器种子的主 tracker） */}
          <Select
            placeholder={t('torrents.filterTracker')}
            value={filters.tracker || undefined}
            onChange={(val) => setFilters((f) => ({ ...f, tracker: val ?? '' }))}
            style={{ width: 200 }}
            allowClear
            options={trackerDomains.map((d) => ({ label: d, value: d }))}
          />
          <ColumnSettings
            visibleKeys={visibleKeys}
            orderKeys={orderKeys}
            onChange={handleColumnChange}
          />
        </Space>
      </div>

      {/* Batch Actions — always visible */}
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
          {t('torrents.addTorrent')}
        </Button>
        <Button icon={<PauseOutlined />} onClick={() => void handleBatchAction('pause')}>
          {t('torrents.batchPause')}
        </Button>
        <Button icon={<PlayCircleOutlined />} onClick={() => void handleBatchAction('resume')}>
          {t('torrents.batchResume')}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => void handleBatchAction('recheck')}>
          {t('torrents.batchRecheck')}
        </Button>
        <Button danger icon={<DeleteOutlined />} onClick={() => void handleBatchAction('delete')}>
          {t('torrents.batchDelete')}
        </Button>
        {selectedRowKeys.length > 0 && (
          <Tag color="blue">{t('torrents.selected', { count: selectedRowKeys.length })}</Tag>
        )}
      </Space>

      {/* Table（左键单击行：切换该行选中态；行右键打开菜单：菜单目标 = 右键行在选中集内
          则整个选中集，否则仅该行。右键不改变选中态） */}
      <Table
        dataSource={filteredTorrents}
        columns={columns}
        rowKey="hash"
        size="small"
        scroll={{ x: scrollX, y: 560 }}
        virtual
        pagination={{
          showTotal: (total, range) =>
            t('torrents.paginationTotal', { from: range[0], to: range[1], count: total }),
        }}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
          columnWidth: 40,
        }}
        onRow={(record) => ({
          onClick: (e) => {
            // 点击来自复选框列或操作列内的元素时不做行级切换，
            // 避免与勾选（onChange 已处理）及「查看」链接叠加双重触发
            const el = e.target as HTMLElement
            if (el.closest('input, button, a, .ant-table-selection-column')) return
            setSelectedRowKeys((keys) =>
              keys.includes(record.hash)
                ? keys.filter((k) => k !== record.hash)
                : [...keys, record.hash],
            )
          },
          onContextMenu: (e) => {
            e.preventDefault()
            // 菜单目标：右键行在复选框选中集内 → 整个选中集；否则仅右键的这一行。
            // 不改动选中态（左键单击才切换选中，右键保持不变）。
            // 目标集同步冻结进 ctx，避免菜单引用实时轮询数据
            const targets = selectedRowKeys.includes(record.hash)
              ? torrents.filter((t) => selectedRowKeys.includes(t.hash))
              : [record]
            setCtx({
              anchor: record,
              targets,
              pos: { x: e.clientX, y: e.clientY },
            })
          },
        })}
      />

      {/* 右键菜单（独立渲染，锚定在光标处） */}
      {activeServer && (
        <TorrentContextMenu
          anchor={ctx?.anchor ?? null}
          targets={ctx?.targets ?? []}
          pos={ctx?.pos ?? null}
          categories={caps.has('categories') ? taxonomy.categories : []}
          tags={taxonomy.tags}
          server={activeServer}
          onBatchAction={(a) => void handleBatchAction(a)}
          onViewDetail={setDrawerTorrent}
          onClearSelection={() => setSelectedRowKeys([])}
          onClose={() => setCtx(null)}
          onRefreshTaxonomy={taxonomy.refresh}
        />
      )}

      {/* Detail Drawer */}
      <TorrentDetailDrawer torrent={drawerTorrent} onClose={() => setDrawerTorrent(null)} />

      {/* Add Torrent Modal */}
      {activeServer && (
        <AddTorrentModal open={addModalOpen} onClose={() => setAddModalOpen(false)} server={activeServer} />
      )}
    </Card>
  )
}

/** 当前服务器显示名（错误提示用） */
function currentServerName(servers: { id: string; name: string }[], activeServerId: string | null): string {
  return servers.find((s) => s.id === activeServerId)?.name ?? activeServerId ?? ''
}
