import { createContext, useContext } from 'react'

const ServerIdContext = createContext<string>('')

export const ServerIdProvider = ServerIdContext.Provider

/** 获取当前设置页选中的服务器 ID */
export function useActiveServerId(): string {
  const id = useContext(ServerIdContext)
  if (!id) throw new Error('useActiveServerId 必须在 ServerIdProvider 内使用')
  return id
}
