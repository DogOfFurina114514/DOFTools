export const LOCALES = ['zh-CN', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export type LocalizedText = Record<Locale, string>
export type DisplayText = string | LocalizedText
export const isLocale = (value: unknown): value is Locale => value === 'zh-CN' || value === 'en'
export const bilingual = (zh: string, en: string): LocalizedText => ({ 'zh-CN': zh, en })
export const BRAND = bilingual('芙芙的狗工具箱', 'DogOfFurina Toolbox')
export function localize(locale: Locale, text: DisplayText): string {
  return typeof text === 'string' ? text : text[locale]
}
export function translate(
  locale: Locale,
  zh: string,
  en: string,
  values: Record<string, string | number> = {},
) {
  return localize(locale, bilingual(zh, en)).replace(/\{(\w+)\}/g, (match, key: string) =>
    String(values[key] ?? match),
  )
}
export class LocalizedError extends Error {
  readonly messages: LocalizedText
  constructor(zh: string, en: string) {
    super(zh)
    this.messages = bilingual(zh, en)
  }
}
export function errorMessage(error: unknown): DisplayText {
  return error instanceof LocalizedError
    ? error.messages
    : error instanceof Error
      ? error.message
      : String(error)
}
