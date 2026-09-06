/** qBittorrent 的 tags 字段是逗号拼接的字符串，UI 侧拆分为数组 */
export function splitTags(tags: string): string[] {
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * 复制文本到剪贴板，返回是否成功。
 * Clipboard API 仅安全上下文（HTTPS/localhost）可用，HTTP 部署下为 undefined，
 * 此时回退 execCommand('copy')（antd Typography copyable 同款思路）。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 权限被拒等：继续走 execCommand 回退
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(ta)
  }
}

/** 从 tracker URL 提取可读的 host:port */
export function trackerDomain(url: string): string {
  if (!url) return ''
  try {
    const u = new URL(url)
    return u.host
  } catch {
    return url.replace(/^[a-z]+:\/\//i, '').split('/')[0] || url
  }
}
