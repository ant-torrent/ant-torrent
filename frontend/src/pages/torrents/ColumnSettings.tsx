import { useState, useCallback, useRef } from 'react'
import { Button, Checkbox, Popover, Typography, Divider, Space } from 'antd'
import { SettingOutlined, HolderOutlined, UndoOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ALL_COLUMNS, DEFAULT_VISIBLE_KEYS, DEFAULT_ORDER } from './columns'
import type { TorrentColumnPrefs } from '@/stores/appStore'

const { Text } = Typography

interface Props {
  /** 当前可见列 */
  visibleKeys: string[]
  /** 当前列顺序 */
  orderKeys: string[]
  /** 变更回调 */
  onChange: (prefs: TorrentColumnPrefs) => void
}

export default function ColumnSettings({ visibleKeys, orderKeys, onChange }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const dragItem = useRef<string | null>(null)
  const dragOver = useRef<string | null>(null)

  const handleToggle = useCallback(
    (key: string, checked: boolean) => {
      const next = checked
        ? [...visibleKeys, key]
        : visibleKeys.filter((k) => k !== key)
      onChange({ visible: next, order: orderKeys })
    },
    [visibleKeys, orderKeys, onChange],
  )

  const handleDragStart = (key: string) => {
    dragItem.current = key
  }

  const handleDragEnter = (key: string) => {
    dragOver.current = key
  }

  const handleDragEnd = () => {
    if (dragItem.current && dragOver.current && dragItem.current !== dragOver.current) {
      const colDef = ALL_COLUMNS.find((c) => c.key === dragItem.current)
      if (colDef?.locked) return // locked 列不可移动

      const next = [...orderKeys]
      const fromIdx = next.indexOf(dragItem.current)
      const toIdx = next.indexOf(dragOver.current)
      if (fromIdx >= 0 && toIdx >= 0) {
        next.splice(fromIdx, 1)
        next.splice(toIdx, 0, dragItem.current)
        onChange({ visible: visibleKeys, order: next })
      }
    }
    dragItem.current = null
    dragOver.current = null
  }

  const handleReset = () => {
    onChange({ visible: [...DEFAULT_VISIBLE_KEYS], order: [...DEFAULT_ORDER] })
  }

  const handleSelectAll = useCallback(() => {
    // locked 列（name/actions）在 buildColumns 中强制可见，这里全量写入保持一致
    onChange({ visible: [...DEFAULT_ORDER], order: orderKeys })
  }, [orderKeys, onChange])

  const handleDeselectAll = useCallback(() => {
    // 仅剩 locked 列强制可见
    onChange({ visible: [], order: orderKeys })
  }, [orderKeys, onChange])

  const visibleSet = new Set(visibleKeys)

  // 按 orderKeys 排序渲染列表
  const sortedItems = orderKeys
    .map((key) => ALL_COLUMNS.find((c) => c.key === key))
    .filter(Boolean) as (typeof ALL_COLUMNS)[number][]

  const content = (
    <div
      style={{ width: 260, maxHeight: 420, overflowY: 'auto' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('torrents.columnSettings.dragHint')}
        </Text>
        <Space size={0}>
          <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={handleSelectAll}>
            {t('torrents.columnSettings.selectAll')}
          </Button>
          <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={handleDeselectAll}>
            {t('torrents.columnSettings.deselectAll')}
          </Button>
        </Space>
      </div>
      {sortedItems.map((col) => {
        const isLocked = col.locked
        const isChecked = isLocked || visibleSet.has(col.key)
        return (
          <div
            key={col.key}
            draggable={!isLocked}
            onDragStart={() => handleDragStart(col.key)}
            onDragEnter={() => handleDragEnter(col.key)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 0',
              cursor: isLocked ? 'default' : 'grab',
              opacity: isLocked ? 0.6 : 1,
            }}
          >
            {!isLocked && (
              <HolderOutlined style={{ color: '#999', fontSize: 12, flexShrink: 0 }} />
            )}
            {isLocked && <span style={{ width: 12, flexShrink: 0 }} />}
            <Checkbox
              checked={isChecked}
              disabled={isLocked}
              onChange={(e) => handleToggle(col.key, e.target.checked)}
            />
            <Text style={{ fontSize: 13 }}>{t(col.titleKey)}</Text>
          </div>
        )
      })}
      <Divider style={{ margin: '8px 0' }} />
      <Button
        type="link"
        size="small"
        icon={<UndoOutlined />}
        onClick={handleReset}
      >
        {t('torrents.columnSettings.reset')}
      </Button>
    </div>
  )

  return (
    <Popover
      title={t('torrents.columnSettings.title')}
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
    >
      <Button icon={<SettingOutlined />} title={t('torrents.columnSettings.title')} />
    </Popover>
  )
}
