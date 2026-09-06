import { useState, useCallback } from 'react'
import { App } from 'antd'
import type { FormInstance } from 'antd'
import { qbtApi } from '@/services/api/client'
import { useTranslation } from 'react-i18next'
import type { AppPreferences } from '@/services/types'
import { DEFAULT_PREFERENCES } from '@/services/preferencesDefaults'

/**
 * scan_dirs 在 qB v5 实际是 { 监控目录: 0 | 1 | 保存目录 }：
 * 0 = 保存到监控目录自身，1 = 保存到默认保存路径，字符串 = 自定义保存目录
 * （旧版 qB 为 string[]）。表单用多行文本编辑，装载/保存时在两种形态间转换，
 * 文本格式：每行一条「监控目录」/「监控目录: default」/「监控目录: /路径」（按第一个冒号拆分）。
 */
function scanDirsToText(v: unknown): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.filter((s) => typeof s === 'string' && s.trim()).join('\n')
  if (v && typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([dir, saveTo]) => {
        if (saveTo === 0) return dir
        if (saveTo === 1) return `${dir}: default`
        return `${dir}: ${saveTo}`
      })
      .join('\n')
  }
  return ''
}

function textToScanDirs(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s) continue
    const idx = s.indexOf(':')
    if (idx <= 0) out[s] = 0
    else {
      const val = s.slice(idx + 1).trim()
      out[s.slice(0, idx).trim()] = !val || val === 'default' ? 1 : val
    }
  }
  return out
}

export function usePreferencesForm(serverId: string) {
  const { t } = useTranslation()
  const { message } = App.useApp()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preferences, setPreferences] = useState<AppPreferences>({ ...DEFAULT_PREFERENCES })

  const loadPreferences = useCallback(async () => {
    setLoading(true)
    try {
      const prefs = await qbtApi.getPreferences(serverId)
      // scan_dirs 转多行文本，避免 TextArea 显示 [object Object]
      setPreferences({ ...prefs, scan_dirs: scanDirsToText(prefs.scan_dirs) })
    } catch {
      message.error(t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [serverId, message, t])

  const savePreferences = useCallback(
    async (values: Partial<AppPreferences>) => {
      setSaving(true)
      try {
        // 表单里的 scan_dirs 是多行文本，提交前还原为 qB 需要的对象形态
        const payload: Partial<AppPreferences> = { ...values }
        if (typeof payload.scan_dirs === 'string') {
          payload.scan_dirs = textToScanDirs(payload.scan_dirs) as unknown as AppPreferences['scan_dirs']
        }
        await qbtApi.setPreferences(serverId, payload)
        setPreferences((prev) => ({ ...prev, ...values }))
        return true
      } catch {
        message.error(t('common.saveFailed'))
        return false
      } finally {
        setSaving(false)
      }
    },
    [serverId, message, t],
  )

  const resetPreferences = useCallback(
    (form: FormInstance, names?: string[]) => {
      // 指定 names 时仅重置对应字段（按 tab 局部重置）
      if (names) {
        const subset: Record<string, unknown> = {}
        for (const n of names) subset[n] = (preferences as unknown as Record<string, unknown>)[n]
        form.setFieldsValue(subset)
      } else {
        form.setFieldsValue(preferences)
      }
      message.info(t('common.reset'))
    },
    [preferences, message, t],
  )

  return {
    loading,
    saving,
    preferences,
    loadPreferences,
    savePreferences,
    resetPreferences,
  }
}
