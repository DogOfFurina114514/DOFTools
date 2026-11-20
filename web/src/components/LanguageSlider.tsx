import { type KeyboardEvent } from 'react'
import { useLocale } from '../lib/i18n'

export function LanguageSlider() {
  const { locale, setLocale, t } = useLocale()
  const options = (['zh-CN', 'en'] as const).map((id, index) => {
    const props = {
      'aria-label': id === 'en' ? 'English' : '中文',
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index
        setLocale(next === 0 ? 'zh-CN' : 'en')
        const target = event.currentTarget.parentElement?.children[next] as HTMLElement | undefined
        target?.focus()
      },
    }
    return (
      <button
        key={id}
        {...props}
        type="button"
        aria-pressed={locale === id}
        tabIndex={locale === id ? 0 : -1}
        onClick={() => setLocale(id)}
      >
        {id === 'en' ? 'EN' : '中文'}
      </button>
    )
  })
  return (
    <div className="language-slider" data-language={locale}>
      <span className="language-thumb" aria-hidden="true" />
      <div role="group" aria-label={t('网站语言', 'Language')}>
        {options}
      </div>
    </div>
  )
}
