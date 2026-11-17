import { createContext, useCallback, useContext, useLayoutEffect, type ReactNode } from 'react'
import { useStoredState } from './storage'
import { BRAND, isLocale, localize, translate, type DisplayText, type Locale } from './locale'

const Context = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({
  locale: 'zh-CN',
  setLocale: () => {},
})
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useStoredState<Locale>('language', 'zh-CN', isLocale)
  useLayoutEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dataset.language = locale
    document.title = localize(locale, BRAND)
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        'content',
        translate(
          locale,
          '芙芙的狗工具箱：纯前端工具箱，预留图片、视频、音频、文档与其他分类，支持八种风格与电脑端本地 AI。',
          'DogOfFurina Toolbox: a browser toolbox with image, video, audio, document and other categories, eight styles, and local AI on desktop.',
        ),
      )
  }, [locale])
  return <Context.Provider value={{ locale, setLocale }}>{children}</Context.Provider>
}
export function useLocale() {
  const { locale, setLocale } = useContext(Context)
  const t = useCallback(
    (zh: string, en: string, values?: Record<string, string | number>) =>
      translate(locale, zh, en, values),
    [locale],
  )
  const resolve = useCallback((text: DisplayText) => localize(locale, text), [locale])
  return { locale, setLocale, t, resolve, brand: resolve(BRAND) }
}
