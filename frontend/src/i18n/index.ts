import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import { useAppStore } from '@/stores/appStore'

import enUS from './locales/en-US.json'
import zhCN from './locales/zh-CN.json'

export type AppLocale = 'zh-CN' | 'en-US'

/**
 * 语言唯一驱动源是 appStore（zustand persist）；
 * 这里在初始化时读取它作为初始语言，切换语言走 i18next.changeLanguage。
 */
void i18next.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: useAppStore.getState().locale,
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
})

export default i18next
