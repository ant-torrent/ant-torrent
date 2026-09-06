import { useEffect, useRef } from 'react'

/**
 * 周期执行 callback；页面不可见（document.hidden）时跳过执行以省资源。
 * delay 传 null 暂停。callback 经 ref 转发，无需稳定引用。
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedRef = useRef(callback)

  useEffect(() => {
    savedRef.current = callback
  })

  useEffect(() => {
    if (delay === null) return
    const id = window.setInterval(() => {
      if (document.hidden) return
      savedRef.current()
    }, delay)
    return () => window.clearInterval(id)
  }, [delay])
}
