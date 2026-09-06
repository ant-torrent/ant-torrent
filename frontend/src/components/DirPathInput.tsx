import { useCallback, useState } from 'react'
import { Alert, App, Button, Empty, Input, Modal, Radio, Space, Spin, Tree, Typography } from 'antd'
import type { TreeDataNode } from 'antd'
import { ArrowUpOutlined, FolderOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fsApi, qbtApi, type FsEntry, type FsInfo, type FsListResult } from '@/services/api/client'
import { useAppStore } from '@/stores/appStore'

const { Text } = Typography

export interface DirPathInputProps {
  serverId: string
  /** Form.Item 注入 */
  value?: string
  /** Form.Item 注入 */
  onChange?: (value: string) => void
  disabled?: boolean
  placeholder?: string
  size?: 'small' | 'middle' | 'large'
  allowClear?: boolean
}

/** 目录浏览弹窗的阶段 */
type Phase = 'info' | 'browse' | 'remote' | 'infoError'

/** Windows 盘符路径（C:\…、C:/…）或 UNC 路径（\\srv\share…）；agent 所在机器可能是 Windows */
function isWinPath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

/** 按两种分隔符统一切分路径段（过滤空段）：/a/b → [a,b]；C:\a\b → [C:,a,b] */
function segmentsOf(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean)
}

/** 路径末段作为树根标题：/Users/veapon/Downloads → Downloads、C:\workspace → workspace；根目录显示 / */
function titleOf(path: string): string {
  if (path === '') return '/'
  const segs = segmentsOf(path)
  return segs[segs.length - 1] ?? '/'
}

/** 父目录路径（两种平台）：/a/b → /a、/ → ''；C:\a\b → C:\a、C:\a → C:\、C:\ 与 \\srv\share → '' */
function parentOf(path: string): string {
  if (path === '' || path === '/') return ''
  if (isWinPath(path)) {
    const norm = path.replace(/\//g, '\\')
    const drive = norm.match(/^[a-zA-Z]:\\/)
    if (drive) {
      const rest = segmentsOf(norm.slice(drive[0].length))
      if (rest.length === 0) return '' // C:\ 已是根
      if (rest.length === 1) return drive[0] // C:\a → C:\
      return drive[0] + rest.slice(0, -1).join('\\')
    }
    const parts = segmentsOf(norm) // UNC：[srv, share, sub…]
    if (parts.length <= 2) return '' // \\srv\share 已是根
    return '\\\\' + parts.slice(0, -1).join('\\')
  }
  const parent = path.replace(/\/+$/, '').replace(/\/[^/]+$/, '')
  return parent || '/'
}

/** 粗判 path 是否落在某个白名单目录内（分隔符/大小写归一后的前缀匹配；与 agent 端语义对齐，用于跳过必败请求） */
function withinWhitelist(path: string, dirs: string[]): boolean {
  if (!path || dirs.length === 0) return false
  const norm = (s: string) => s.replace(/\//g, '\\').replace(/[\\/]+$/, '').toLowerCase()
  const p = norm(path)
  return dirs.some((d) => {
    const nd = norm(d)
    return p === nd || p.startsWith(nd + '\\')
  })
}

/**
 * 目录路径输入框：手输 + 浏览按钮。
 * 浏览弹窗为懒加载目录树（展开节点时才取其子目录），面包屑/上一级可重定位树根。
 * 浏览能力按服务器分层（后端 /fs/info 判定）：
 * agent 在线 → agent 所在机器目录树；同机回环 → 后端本机目录树；远程 → 已知目录候选。
 */
export function DirPathInput({ serverId, value, onChange, disabled, placeholder, size, allowClear }: DirPathInputProps) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const tt = (k: string) => t(`dirPicker.${k}`)
  const servers = useAppStore((s) => s.servers)

  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('info')
  const [info, setInfo] = useState<FsInfo | null>(null)
  // 树状态：treeData 以起始目录为根；展开节点时懒加载其子目录
  const [treeData, setTreeData] = useState<TreeDataNode[]>([])
  const [rootPath, setRootPath] = useState('')
  const [rootLoading, setRootLoading] = useState(false)
  const [rootError, setRootError] = useState('')
  const [selPath, setSelPath] = useState('')
  // remote 候选状态
  const [candidates, setCandidates] = useState<string[] | null>(null)
  const [selected, setSelected] = useState('')

  /** 服务器 URL 是否为回环地址（非回环的 local 模式需要同机提示） */
  const isLoopbackServer = useCallback(() => {
    const srv = servers.find((s) => s.id === serverId)
    if (!srv) return true
    try {
      const host = new URL(srv.url).hostname
      return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
    } catch {
      return true
    }
  }, [servers, serverId])

  /** FsEntry → 树节点（key 用完整路径，选中即得结果） */
  const toNode = useCallback(
    (e: FsEntry): TreeDataNode => ({ key: e.path, title: e.name, icon: <FolderOutlined /> }),
    [],
  )

  /** 递归把 fetch 到的子节点挂到指定路径下 */
  const attachChildren = useCallback((nodes: TreeDataNode[], path: string, children: TreeDataNode[]): TreeDataNode[] => {
    return nodes.map((n) => {
      if (String(n.key) === path) return { ...n, children }
      if (n.children?.length) return { ...n, children: attachChildren(n.children, path, children) }
      return n
    })
  }, [])

  /** 装载（或重定位）根节点：path 为空时后端返回默认起始目录 */
  const loadRoot = useCallback(
    async (path: string, opts?: { silentFallback?: boolean }): Promise<void> => {
      setRootLoading(true)
      setRootError('')
      try {
        const result = await fsApi.list(serverId, path)
        setRootPath(result.path)
        setSelPath(result.path)
        setTreeData([{ key: result.path, title: titleOf(result.path), icon: <FolderOpenOutlined />, children: result.entries.map(toNode) }])
      } catch (err) {
        // 首跳失败（起始路径不可访问 / 越出 agent 白名单）：回落默认位置重试一次；
        // agent 的空路径会落到第一个白名单目录
        if (opts?.silentFallback && path) {
          message.warning(tt('fallbackNotice'))
          try {
            const result = await fsApi.list(serverId, '')
            setRootPath(result.path)
            setSelPath(result.path)
            setTreeData([{ key: result.path, title: titleOf(result.path), icon: <FolderOpenOutlined />, children: result.entries.map(toNode) }])
            return
          } catch {
            // 回落也失败，走下方错误展示
          }
        }
        setTreeData([])
        setRootError(err instanceof Error ? err.message : t('common.loadFailed'))
      } finally {
        setRootLoading(false)
      }
    },
    [serverId, message, tt, toNode],
  )

  /** 树节点展开时懒加载其子目录 */
  const loadChildren = useCallback(
    async (node: TreeDataNode): Promise<void> => {
      const path = String(node.key)
      try {
        const result: FsListResult = await fsApi.list(serverId, path)
        setTreeData((prev) => attachChildren(prev, path, result.entries.map(toNode)))
      } catch (err) {
        // 子目录读取失败（权限/被删等）：提示并挂空，避免节点一直转圈
        message.warning(err instanceof Error ? err.message : t('common.loadFailed'))
        setTreeData((prev) => attachChildren(prev, path, []))
      }
    },
    [serverId, message, tt, toNode, attachChildren],
  )

  /** 打开弹窗：探测模式并初始化对应数据 */
  const openPicker = async () => {
    setOpen(true)
    setPhase('info')
    setInfo(null)
    setTreeData([])
    setRootPath('')
    setRootError('')
    setSelPath('')
    setCandidates(null)
    setSelected('')
    try {
      const fsInfo = await fsApi.info(serverId)
      setInfo(fsInfo)
      if (fsInfo.mode === 'remote') {
        setPhase('remote')
        void loadCandidates()
        return
      }
      setPhase('browse')
      const start = value?.trim() || fsInfo.suggestedPath || ''
      // agent 模式下起始路径若必在白名单外（如 qB 默认保存路径未被放行），直接落到白名单根目录，
      // 省去一次必败请求与回落提示
      if (fsInfo.mode === 'agent' && start && fsInfo.agent && !withinWhitelist(start, fsInfo.agent.allowedDirs)) {
        void loadRoot('', { silentFallback: true })
        return
      }
      void loadRoot(start, { silentFallback: true })
    } catch (err) {
      setRootError(err instanceof Error ? err.message : t('common.loadFailed'))
      setPhase('infoError')
    }
  }

  /** remote 模式：从 qB API 收集已知目录（defaultSavePath / 偏好路径 / 分类路径） */
  const loadCandidates = useCallback(async () => {
    const [dp, prefs, cats] = await Promise.allSettled([
      qbtApi.getDefaultSavePath(serverId),
      qbtApi.getPreferences(serverId),
      qbtApi.getCategories(serverId),
    ])
    const byKey = new Map<string, string>()
    const add = (p?: string) => {
      const v = p?.trim()
      if (!v) return
      const key = v.replace(/[\\/]+$/, '') || '/'
      if (!byKey.has(key)) byKey.set(key, v)
    }
    if (dp.status === 'fulfilled') add(dp.value)
    if (prefs.status === 'fulfilled') {
      const p = prefs.value as unknown as Record<string, unknown>
      add(p.save_path as string)
      add(p.temp_path as string)
      add(p.export_dir as string)
      add(p.export_dir_fin as string)
      // scan_dirs 实际可能是 map（键为目录），也可能是文本
      const sd = p.scan_dirs
      if (sd && typeof sd === 'object') {
        Object.keys(sd).forEach(add)
      } else if (typeof sd === 'string') {
        sd.split('\n').forEach((line) => add(line.split('|')[0]))
      }
    }
    if (cats.status === 'fulfilled') cats.value.forEach((c) => add(c.savePath))
    setCandidates([...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })))
  }, [serverId])

  const handleOk = () => {
    if (phase === 'browse' && selPath) {
      onChange?.(selPath)
    } else if (phase === 'remote' && selected) {
      onChange?.(selected)
    }
    setOpen(false)
  }

  /** 面包屑分段（按当前树根，兼容两种平台）：
   *  POSIX：/Users/veapon/Downloads → [/, Users, veapon, Downloads]
   *  Windows：C:\a\b → [C:\, a, b]；agent 模式下白名单之外的段不可导航（如盘符根），直接隐藏 */
  const breadcrumb = (() => {
    if (!rootPath) return []
    const items: { label: string; path: string }[] = []
    if (isWinPath(rootPath)) {
      const norm = rootPath.replace(/\//g, '\\')
      const drive = norm.match(/^[a-zA-Z]:\\/)
      if (drive) {
        let acc = drive[0]
        items.push({ label: drive[0], path: acc })
        for (const seg of segmentsOf(norm.slice(drive[0].length))) {
          acc = acc.endsWith('\\') ? acc + seg : acc + '\\' + seg
          items.push({ label: seg, path: acc })
        }
      } else {
        const parts = segmentsOf(norm) // UNC：[srv, share, sub…]
        let acc = '\\\\' + parts[0]
        items.push({ label: parts[0], path: acc })
        for (const seg of parts.slice(1)) {
          acc += '\\' + seg
          items.push({ label: seg, path: acc })
        }
      }
    } else {
      const parts = rootPath.split('/').filter(Boolean)
      items.push({ label: '/', path: '/' })
      let acc = ''
      for (const part of parts) {
        acc += '/' + part
        items.push({ label: part, path: acc })
      }
    }
    if (info?.mode === 'agent' && info.agent) {
      return items.filter((it) => withinWhitelist(it.path, info.agent!.allowedDirs))
    }
    return items
  })()

  /** 「上一级」可用性：无父级禁用；agent 模式下父级越出白名单同样禁用（请求必被 agent 拒绝） */
  const canGoUp = (() => {
    const parent = parentOf(rootPath)
    if (!parent) return false
    if (info?.mode === 'agent' && info.agent && !withinWhitelist(parent, info.agent.allowedDirs)) return false
    return true
  })()

  return (
    <>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          size={size}
          allowClear={allowClear}
        />
        <Button
          icon={<FolderOpenOutlined />}
          disabled={disabled}
          onClick={() => void openPicker()}
          size={size}
          title={tt('browse')}
        />
      </Space.Compact>

      <Modal
        open={open}
        title={tt('title')}
        width={520}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onOk={handleOk}
        onCancel={() => setOpen(false)}
        okButtonProps={{ disabled: phase === 'browse' ? rootLoading || !selPath : phase === 'remote' ? !selected : true }}
        destroyOnHidden
      >
        {phase === 'info' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin />
          </div>
        )}

        {phase === 'infoError' && (
          <div style={{ padding: '24px 0' }}>
            <Alert type="error" showIcon message={rootError || t('common.loadFailed')} />
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Button onClick={() => void openPicker()}>{tt('retry')}</Button>
            </div>
          </div>
        )}

        {phase === 'browse' && info && (
          <>
            {info.mode === 'local' && !isLoopbackServer() && (
              <Alert type="info" showIcon message={tt('collocatedHint')} style={{ marginBottom: 12 }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Button
                size="small"
                icon={<ArrowUpOutlined />}
                disabled={!canGoUp}
                onClick={() => void loadRoot(parentOf(rootPath))}
              >
                {tt('up')}
              </Button>
              <div style={{ overflowX: 'auto', whiteSpace: 'nowrap', flex: 1 }}>
                {breadcrumb.map((item, i) => (
                  <span key={item.path}>
                    {i > 0 && <Text type="secondary"> / </Text>}
                    <a onClick={() => void loadRoot(item.path)} style={{ cursor: 'pointer' }}>
                      {item.label}
                    </a>
                  </span>
                ))}
              </div>
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--ant-color-border-secondary, #f0f0f0)', borderRadius: 6, padding: '4px 4px' }}>
              {rootLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <Spin />
                </div>
              ) : rootError ? (
                <div style={{ padding: 12 }}>
                  <Alert type="error" showIcon message={rootError} />
                  <div style={{ textAlign: 'center', marginTop: 12 }}>
                    <Button size="small" onClick={() => void loadRoot(rootPath)}>
                      {tt('retry')}
                    </Button>
                  </div>
                </div>
              ) : treeData[0]?.children?.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tt('empty')} style={{ padding: '24px 0' }} />
              ) : (
                <Tree.DirectoryTree
                  key={rootPath}
                  blockNode
                  showIcon
                  treeData={treeData}
                  loadData={loadChildren}
                  selectedKeys={selPath ? [selPath] : []}
                  defaultExpandedKeys={rootPath ? [rootPath] : []}
                  onSelect={(keys: React.Key[]) => {
                    // 目录选择器必须始终有选中项，忽略取消选择
                    if (keys.length) setSelPath(String(keys[0]))
                  }}
                />
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">{tt('currentPath')}：</Text>
              <Text code copyable>
                {selPath || '-'}
              </Text>
            </div>
          </>
        )}

        {phase === 'remote' && (
          <>
            <Alert
              type="warning"
              showIcon
              message={tt('remoteTitle')}
              description={tt('remoteDesc')}
              style={{ marginBottom: 12 }}
            />
            <Text type="secondary">{tt('remoteCandidates')}</Text>
            <div style={{ marginTop: 8 }}>
              {candidates === null ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <Spin />
                </div>
              ) : candidates.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tt('remoteEmpty')} />
              ) : (
                <Radio.Group
                  value={selected}
                  onChange={(e) => setSelected(e.target.value as string)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}
                >
                  {candidates.map((path) => (
                    <Radio key={path} value={path} style={{ margin: 0 }}>
                      <span style={{ fontFamily: 'monospace' }}>{path}</span>
                    </Radio>
                  ))}
                </Radio.Group>
              )}
            </div>
          </>
        )}
      </Modal>
    </>
  )
}

export default DirPathInput
