import type { Locale as AntdLocale } from 'antd/lib/locale'

import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'

import type { AppLocale } from './index'

import 'dayjs/locale/zh-cn'

export const ANTD_LOCALES: Record<AppLocale, AntdLocale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

export const DAYJS_LOCALES: Record<AppLocale, string> = {
  'zh-CN': 'zh-cn',
  'en-US': 'en',
}
