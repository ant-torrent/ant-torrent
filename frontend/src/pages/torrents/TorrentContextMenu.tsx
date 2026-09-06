import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App, Checkbox, Dropdown, Input, InputNumber, Modal, Radio, Typography } from 'antd'
import type { MenuProps } from 'antd'
import {
  AppstoreOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  ClearOutlined,
  CloseCircleOutlined,
  DashboardOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FlagOutlined,
  FolderOpenOutlined,
  PauseOutlined,
  PieChartOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  StopOutlined,
  SyncOutlined,
  TagOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  VerticalAlignMiddleOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { torrentsApi, type ServerConfig } from '@/services/api/client'
import { torrentOps } from '@/services/api/torrentOps'
import { supports } from '@/services/downloaders'
import { refreshServer } from '@/hooks/useTorrentPolling'
import { splitTags } from '@/utils/misc'
import { DirPathInput } from '@/components/DirPathInput'
import type { Torrent } from '@/services/types'

const { Text } = Typography

/** 已停止状态（qB v5 stop 经客户端归一化为 pausedUP/pausedDL） */
const PAUSED_STATES = new Set(['pausedUP', 'pausedDL'])
const ERRORED_STATES = new Set(['error', 'missingFiles'])

type LimitMode = 'global' | 'none' | 'custom'

/** 弹窗种类：dl/up 限速、分享率、保存路径、新建分类/标签 */
type ModalKind = 'dlLimit' | 'upLimit' | 'shareLimits' | 'location' | 'newCategory' | 'newTag' | null

interface Props {
  /** 右键定位行（用于预填当前值、勾选态） */
  anchor: Torrent | null
  /** 操作目标（页面已保证右键行在选中集内，选中集即目标） */
  targets: Torrent[]
  /** 右键光标位置（视口坐标），菜单锚点 */
  pos: { x: number; y: number } | null
  categories: string[]
  tags: string[]
  server: ServerConfig
  /** 复用页面已有的 暂停/启动（含成功提示与刷新） */
  onBatchAction: (action: 'pause' | 'resume') => void
  onViewDetail: (torrent: Torrent) => void
  /** 删除成功后清空选中集 */
  onClearSelection: () => void
  /** 菜单关闭时清空 anchor（保留选中集，便于连续操作） */
  onClose: () => void
  onRefreshTaxonomy: () => void
}

/**
 * 种子列表右键菜单（锚定在光标位置弹出）。
 * 分组：详情 | 启动/强制启动/暂停/删除 | 分类 | 标签 | 限速 | 保存路径/文件优先级/TMM。
 * 菜单项按目标状态禁用（已暂停才可启动、未暂停才可暂停等），避免无效操作。
 */
export function TorrentContextMenu({
  anchor,
  targets,
  pos,
  categories,
  tags,
  server,
  onBatchAction,
  onViewDetail,
  onClearSelection,
  onClose,
  onRefreshTaxonomy,
}: Props) {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()

  const [modalKind, setModalKind] = useState<ModalKind>(null)
  const [submitting, setSubmitting] = useState(false)
  // 菜单内部 open：rc-trigger 只在 open false→true 翻转时对位弹层，
  // 直接用 anchor 派生 open 的话，菜单开着时再次右键（换锚点）不会重新对位，
  // 所以换锚点先关一帧再开，强制 rc-trigger 重新计算弹层位置
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!anchor) {
      setMenuOpen(false)
      return
    }
    setMenuOpen(false)
    const raf = requestAnimationFrame(() => setMenuOpen(true))
    return () => cancelAnimationFrame(raf)
  }, [anchor])
  // 限速（KiB/s；空 = 不限）与路径/名称类输入
  const [speedVal, setSpeedVal] = useState<number | null>(null)
  const [textVal, setTextVal] = useState('')
  // 分享率限制：模式 + 自定义值（ratio 为倍数，seeding 为分钟）
  const [ratioMode, setRatioMode] = useState<LimitMode>('global')
  const [ratioVal, setRatioVal] = useState<number | null>(null)
  const [seedMode, setSeedMode] = useState<LimitMode>('global')
  const [seedVal, setSeedVal] = useState<number | null>(null)
  // 静态 confirm 弹窗内容不随本组件重渲染，勾选态走 ref 读取
  const deleteFilesRef = useRef(false)
  // 延迟关闭定时器比对用的最新 anchor（见 onOpenChange）
  const latestAnchor = useRef(anchor)
  latestAnchor.current = anchor

  // 冻结右键瞬间的目标集（渲染时捕获，直到下次右键才替换）。antd 在菜单项 mousedown
  // 即回调关闭，页面随后清空 ctx，而菜单项 click 晚于该清理到达；若直接读 props，
  // 进行中的点击会读到空目标集（弹窗显示“应用于 0 个”、禁用态闪变、动作落空）。
  const frozenRef = useRef<{ anchor: Torrent | null; targets: Torrent[] }>({
    anchor: null,
    targets: [],
  })
  if (anchor) frozenRef.current = { anchor, targets }
  const cur = frozenRef.current
  const curAnchor = cur.anchor
  const curTargets = cur.targets

  const hashes = useMemo(() => curTargets.map((t) => t.hash), [curTargets])
  const single = curTargets.length === 1 ? curTargets[0] : null
  // 按下载器能力分发的操作集与功能开关（tr 缺失的能力对应菜单项隐藏）
  const ops = useMemo(() => torrentOps(server), [server])
  const can = (f: Parameters<typeof supports>[1]) => supports(server, f)

  // 状态感知：任一目标处于可操作状态即启用（多选时按“还能对谁生效”决定）
  const canResume = curTargets.some((t) => PAUSED_STATES.has(t.state) || t.state === 'error')
  const canPause = curTargets.some((t) => !PAUSED_STATES.has(t.state) && !ERRORED_STATES.has(t.state))
  const allForced = curTargets.length > 0 && curTargets.every((t) => t.force_start)
  const hasIncomplete = curTargets.some((t) => t.progress < 1)
  const allAutoTmm = curTargets.length > 0 && curTargets.every((t) => t.auto_tmm)
  const anchorTags = useMemo(() => new Set(splitTags(curAnchor?.tags ?? '')), [curAnchor?.tags])

  /** 执行 → 成功提示 + 刷新；失败报错。不清理选中（右键批量操作后通常继续操作） */
  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setSubmitting(true)
      try {
        await action()
        message.success(t('torrents.ctx.done', { count: hashes.length }))
        void refreshServer(server.id)
        return true
      } catch (err) {
        message.error(err instanceof Error ? err.message : String(err))
        return false
      } finally {
        setSubmitting(false)
      }
    },
    [hashes.length, message, server.id, t],
  )

  /** 打开弹窗前按单种子当前值预填 */
  const openModal = (kind: Exclude<ModalKind, null>) => {
    const kb = (v: number) => (v > 0 ? Math.round(v / 1024) : null)
    if (kind === 'dlLimit') setSpeedVal(single ? kb(single.dl_limit) : null)
    if (kind === 'upLimit') setSpeedVal(single ? kb(single.up_limit) : null)
    if (kind === 'shareLimits') {
      const mode = (v: number): LimitMode => (v === -2 || v === 0 ? 'global' : v === -1 ? 'none' : 'custom')
      setRatioMode(single ? mode(single.ratio_limit) : 'global')
      setRatioVal(single && single.ratio_limit > 0 ? single.ratio_limit : null)
      setSeedMode(single ? mode(single.seeding_time_limit) : 'global')
      setSeedVal(single && single.seeding_time_limit > 0 ? single.seeding_time_limit : null)
    }
    setTextVal(kind === 'location' ? (single?.save_path ?? '') : '')
    setModalKind(kind)
  }

  const closeModal = () => {
    setModalKind(null)
    onClose()
  }

  const handleMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent.stopPropagation()
    if (key === 'detail' && curAnchor) {
      onViewDetail(curAnchor)
      onClose()
    } else if (key === 'resume') {
      onBatchAction('resume')
    } else if (key === 'forceStart') {
      // qB = 切换持久标志；tr = 一次性绕过队列（start-now）
      void run(() => ops.forceStart(hashes, !allForced))
    } else if (key === 'pause') {
      onBatchAction('pause')
    } else if (key === 'delete') {
      deleteFilesRef.current = false
      modal.confirm({
        title: t('torrents.confirmDelete', { count: hashes.length }),
        icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
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
          await run(() => ops.remove(hashes, deleteFilesRef.current))
          onClearSelection()
        },
      })
    } else if (key === 'cat:new') {
      openModal('newCategory')
    } else if (key === 'tag:new') {
      openModal('newTag')
    } else if (key === 'tag:clear') {
      void run(() => ops.setTags(hashes, [], 'remove'))
    } else if (key.startsWith('cat:')) {
      void run(() => torrentsApi.setCategory(server.id, hashes, key.slice(4)))
    } else if (key.startsWith('tag:')) {
      const tag = key.slice(4)
      void run(() =>
        anchorTags.has(tag)
          ? ops.setTags(hashes, [tag], 'remove')
          : ops.setTags(hashes, [tag], 'add'),
      )
    } else if (key === 'limit:dl') {
      openModal('dlLimit')
    } else if (key === 'limit:up') {
      openModal('upLimit')
    } else if (key === 'limit:share') {
      openModal('shareLimits')
    } else if (key === 'location') {
      openModal('location')
    } else if (key.startsWith('prio:')) {
      void run(() => torrentsApi.setAllFilesPriority(server.id, hashes, Number(key.slice(5))))
    } else if (key === 'tmm') {
      void run(() => torrentsApi.setAutoManagement(server.id, hashes, !allAutoTmm))
    }
  }

  /** 子菜单当前项打勾；勾选列宽度与 antd 图标列（14px + 8px 间距）一致，保证文字对齐 */
  const checkPrefix = (checked: boolean) =>
    checked ? (
      <CheckOutlined style={{ fontSize: 14, marginRight: 8, color: 'var(--ant-color-primary)' }} />
    ) : (
      <span style={{ display: 'inline-block', width: 14, marginRight: 8 }} />
    )

  const items: MenuProps['items'] = useMemo(() => {
    if (!curAnchor) return []
    return [
      // 详情面板暂未覆盖 Transmission，按能力隐藏入口
      ...(can('detail') ? [{ key: 'detail', icon: <EyeOutlined />, label: t('torrents.ctx.detail') }] : []),
      ...(can('detail') ? [{ type: 'divider' as const }] : []),
      {
        key: 'resume',
        icon: <PlayCircleOutlined />,
        label: t('torrents.ctx.resume'),
        disabled: !canResume,
      },
      {
        key: 'forceStart',
        icon: <ThunderboltOutlined />,
        // tr 的 start-now 是一次性动作（无持久标志），文案与勾选态随之不同
        label:
          can('forceStartToggle')
            ? allForced
              ? t('torrents.ctx.unforce')
              : t('torrents.ctx.force')
            : t('torrents.ctx.forceNow'),
        disabled: curTargets.length === 0,
      },
      { key: 'pause', icon: <PauseOutlined />, label: t('torrents.ctx.pause'), disabled: !canPause },
      { type: 'divider' },
      // 分类仅 qB 支持（tr 只有 labels，无注册表/保存路径绑定）
      ...(can('categories')
        ? [
      {
        key: 'group:cat',
        icon: <AppstoreOutlined />,
        label: t('torrents.ctx.category'),
        children: [
          { key: 'cat:new', icon: <PlusOutlined />, label: t('torrents.ctx.newCategory') },
          ...(categories.length > 0 ? [{ type: 'divider' as const }] : []),
          ...categories.map((c) => ({
            key: `cat:${c}`,
            label: (
              <span>
                {checkPrefix(single?.category === c)}
                {c}
              </span>
            ),
          })),
          { type: 'divider' },
          { key: 'cat:', icon: <ClearOutlined />, label: t('torrents.ctx.clearCategory') },
        ],
      },
          ]
        : []),
      {
        key: 'group:tag',
        icon: <TagOutlined />,
        label: t('torrents.ctx.tag'),
        children: [
          { key: 'tag:new', icon: <PlusOutlined />, label: t('torrents.ctx.newTag') },
          ...(tags.length > 0 ? [{ type: 'divider' as const }] : []),
          ...tags.map((tag) => ({
            key: `tag:${tag}`,
            label: (
              <span>
                {checkPrefix(anchorTags.has(tag))}
                {tag}
              </span>
            ),
          })),
          { type: 'divider' },
          {
            key: 'tag:clear',
            icon: <CloseCircleOutlined />,
            label: t('torrents.ctx.clearTags'),
            disabled: anchorTags.size === 0,
          },
        ],
      },
      { type: 'divider' },
      {
        key: 'group:limit',
        icon: <DashboardOutlined />,
        label: t('torrents.ctx.speedLimit'),
        children: [
          { key: 'limit:dl', icon: <DownloadOutlined />, label: t('torrents.ctx.dlLimit') },
          { key: 'limit:up', icon: <UploadOutlined />, label: t('torrents.ctx.upLimit') },
          // tr 无按种子分享率限制
          ...(can('shareLimits')
            ? [
                { type: 'divider' as const },
                { key: 'limit:share', icon: <PieChartOutlined />, label: t('torrents.ctx.shareLimits') },
              ]
            : []),
        ],
      },
      // tr 无「设置保存位置」端点差异（后续迭代经 torrent_set_location 支持）
      ...(can('location')
        ? [
            {
              key: 'location',
              icon: <FolderOpenOutlined />,
              label: t('torrents.ctx.savePath'),
            },
            { type: 'divider' as const },
          ]
        : []),
      // tr 无文件级优先级
      ...(can('filePriority')
        ? [
            {
              key: 'group:prio',
              icon: <FlagOutlined />,
              label: t('torrents.ctx.filePriority'),
              disabled: !hasIncomplete,
              children: [
                { key: 'prio:7', icon: <VerticalAlignTopOutlined />, label: t('torrents.ctx.prioMax') },
                { key: 'prio:6', icon: <ArrowUpOutlined />, label: t('torrents.ctx.prioHigh') },
                { key: 'prio:1', icon: <VerticalAlignMiddleOutlined />, label: t('torrents.ctx.prioNormal') },
                { type: 'divider' as const },
                { key: 'prio:0', icon: <StopOutlined />, label: t('torrents.ctx.prioSkip') },
              ],
            },
          ]
        : []),
      // tr 无自动种子管理
      ...(can('autoTMM')
        ? [
            {
              key: 'tmm',
              icon: <SyncOutlined />,
              label: (
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  {t('torrents.ctx.autoTmm')}
                  {allAutoTmm && (
                    <CheckOutlined
                      style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ant-color-primary)' }}
                    />
                  )}
                </span>
              ),
            },
            { type: 'divider' as const },
          ]
        : []),
      { key: 'delete', icon: <DeleteOutlined />, label: t('torrents.ctx.delete'), danger: true },
    ]
  }, [
    curAnchor, allAutoTmm, allForced, anchorTags, can, canPause, canResume, categories,
    hasIncomplete, server, single, t, tags, curTargets.length,
  ])

  /* ---- 弹窗提交 ---- */

  const submitModal = async () => {
    if (!modalKind) return
    let ok = false
    if (modalKind === 'dlLimit' || modalKind === 'upLimit') {
      const bytes = (speedVal ?? 0) * 1024
      ok = await run(
        () =>
          modalKind === 'dlLimit'
            ? ops.setSpeedLimits(hashes, { dl: bytes })
            : ops.setSpeedLimits(hashes, { up: bytes }),
      )
    } else if (modalKind === 'shareLimits') {
      const resolve = (m: LimitMode, val: number | null): number | undefined =>
        m === 'global' ? -2 : m === 'none' ? -1 : (val ?? undefined)
      const ratioLimit = resolve(ratioMode, ratioVal)
      const seedingTimeLimit = resolve(seedMode, seedVal)
      if (
        (ratioMode === 'custom' && ratioLimit === undefined) ||
        (seedMode === 'custom' && seedingTimeLimit === undefined)
      ) {
        message.warning(t('torrents.ctx.fillCustom'))
        return
      }
      ok = await run(() => torrentsApi.setShareLimits(server.id, hashes, { ratioLimit, seedingTimeLimit }))
    } else if (modalKind === 'location') {
      if (!textVal.trim()) {
        message.warning(t('torrents.ctx.pathRequired'))
        return
      }
      ok = await run(() => torrentsApi.setLocation(server.id, hashes, textVal.trim()))
    } else if (modalKind === 'newCategory') {
      const name = textVal.trim()
      if (!name) {
        message.warning(t('torrents.ctx.nameRequired'))
        return
      }
      ok = await run(() => torrentsApi.setCategory(server.id, hashes, name))
      if (ok) onRefreshTaxonomy()
    } else if (modalKind === 'newTag') {
      const list = textVal
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (list.length === 0) {
        message.warning(t('torrents.ctx.nameRequired'))
        return
      }
      ok = await run(() => torrentsApi.addTags(server.id, hashes, list))
      if (ok) onRefreshTaxonomy()
    }
    if (ok) closeModal()
  }

  const modalTitles: Record<string, string> = {
    dlLimit: t('torrents.ctx.dlLimit'),
    upLimit: t('torrents.ctx.upLimit'),
    shareLimits: t('torrents.ctx.shareLimits'),
    location: t('torrents.ctx.savePath'),
    newCategory: t('torrents.ctx.newCategory'),
    newTag: t('torrents.ctx.newTag'),
  }

  return (
    <>
      {/* 定点锚：Dropdown 以子元素定位弹层，若拿整张表格当子元素，菜单只会贴着
          表格边缘弹出；把锚 span 固定在光标处，菜单即精确出现在鼠标位置，且不受表格
          内部滚动/虚拟行影响。尺寸必须是 1×1 而非 0×0：rc-trigger 对位前会做可见性
          检查（offsetParent 或宽高非零），fixed 元素 offsetParent 恒为 null，0×0 会被
          判为不可见而跳过对位，弹层钉死在屏外初始位；1×1 无背景 + pointerEvents:none
          对用户完全无感。 */}
      <Dropdown
        menu={{ items, onClick: handleMenuClick }}
        open={menuOpen && modalKind === null}
        onOpenChange={(o) => {
          if (o) return
          // 关闭时清 anchor。必须延迟到宏任务：antd 在 mousedown 即回调 onOpenChange，
          // 若同步清空 anchor 会让 items 重渲染为 [] 并移除菜单项，随后的 click 事件
          // 找不到目标，onClick（打开弹窗类操作）随机丢失。期间若又右键了别的行
          // （anchor 已更新），本次关闭作废，避免误关新菜单。
          const closing = latestAnchor.current
          window.setTimeout(() => {
            if (latestAnchor.current === closing) onClose()
          }, 0)
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'fixed',
            left: pos ? pos.x : -9999,
            top: pos ? pos.y : -9999,
            width: 1,
            height: 1,
            pointerEvents: 'none',
          }}
        />
      </Dropdown>

      <Modal
        open={modalKind !== null}
        title={modalKind ? modalTitles[modalKind] : ''}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={submitting}
        onOk={() => void submitModal()}
        onCancel={closeModal}
        destroyOnHidden
        width={modalKind === 'shareLimits' ? 560 : 440}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Text type="secondary" ellipsis>
            {t('torrents.ctx.applyTo', { count: hashes.length })}
            {single ? ` · ${single.name}` : null}
          </Text>

          {(modalKind === 'dlLimit' || modalKind === 'upLimit') && (
            <>
              <InputNumber
                autoFocus
                min={0}
                value={speedVal}
                onChange={(v) => setSpeedVal(v)}
                addonAfter="KiB/s"
                style={{ width: '100%' }}
                placeholder="0"
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('torrents.ctx.unlimitedHint')}
              </Text>
            </>
          )}

          {modalKind === 'shareLimits' && (
            <>
              <LimitRow
                label={t('torrents.ctx.ratioField')}
                mode={ratioMode}
                onMode={setRatioMode}
                value={ratioVal}
                onValue={setRatioVal}
                min={0}
                step={0.1}
              />
              <LimitRow
                label={t('torrents.ctx.seedingField')}
                mode={seedMode}
                onMode={setSeedMode}
                value={seedVal}
                onValue={setSeedVal}
                min={1}
                step={30}
                addonAfter="min"
              />
            </>
          )}

          {modalKind === 'location' && (
            <DirPathInput
              serverId={server.id}
              value={textVal}
              onChange={setTextVal}
              placeholder="/downloads/anime"
            />
          )}

          {modalKind === 'newCategory' && (
            <Input
              autoFocus
              value={textVal}
              onChange={(e) => setTextVal(e.target.value)}
              placeholder={t('torrents.ctx.categoryNamePh')}
              onPressEnter={() => void submitModal()}
            />
          )}

          {modalKind === 'newTag' && (
            <Input
              autoFocus
              value={textVal}
              onChange={(e) => setTextVal(e.target.value)}
              placeholder={t('torrents.ctx.tagNamePh')}
              onPressEnter={() => void submitModal()}
            />
          )}
        </div>
      </Modal>
    </>
  )
}

/** 分享率/做种时间限制行：跟随全局 / 不限制 / 自定义 三态 + 自定义数值输入 */
function LimitRow({
  label, mode, onMode, value, onValue, min, step, addonAfter,
}: {
  label: string
  mode: LimitMode
  onMode: (m: LimitMode) => void
  value: number | null
  onValue: (v: number | null) => void
  min: number
  step: number
  addonAfter?: string
}) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Text style={{ width: 150, flexShrink: 0 }}>{label}</Text>
      <Radio.Group
        size="small"
        value={mode}
        onChange={(e) => onMode(e.target.value as LimitMode)}
        options={[
          { label: t('torrents.ctx.followGlobal'), value: 'global' },
          { label: t('torrents.ctx.noLimit'), value: 'none' },
          { label: t('torrents.ctx.custom'), value: 'custom' },
        ]}
      />
      {mode === 'custom' && (
        <InputNumber
          size="small"
          min={min}
          step={step}
          value={value}
          onChange={onValue}
          addonAfter={addonAfter}
          style={{ width: 150 }}
        />
      )}
    </div>
  )
}
