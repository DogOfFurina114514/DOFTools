import { createElement, useEffect, useRef } from 'react'
import { useAppearance } from '../lib/appearance'
import { useLocale } from '../lib/i18n'
import { ToggleButton } from '@fluentui/react-components'

export function LanguageSlider() {
  const { locale, setLocale, t } = useLocale()
  const { style, materialReady } = useAppearance()
  const native = style === 'material' && materialReady
  const group = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = group.current
    if (!element || !native) return
    const select = (event: Event) => {
      const { index, selected } = (event as CustomEvent<{ index: number; selected: boolean }>)
        .detail
      if (selected) setLocale(index === 0 ? 'zh-CN' : 'en')
    }
    element.addEventListener('segmented-button-set-selection', select)
    return () => element.removeEventListener('segmented-button-set-selection', select)
  }, [native, setLocale])
  const options = (['zh-CN', 'en'] as const).map((id, index) => {
    const props = {
      key: id,
      'aria-label': id === 'en' ? 'English' : '中文',
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index
        setLocale(next === 0 ? 'zh-CN' : 'en')
        const target = event.currentTarget.parentElement?.children[next] as HTMLElement | undefined
        if (native) (target?.shadowRoot?.querySelector('button') as HTMLButtonElement)?.focus()
        else target?.focus()
      },
    }
    return native ? (
      createElement('md-outlined-segmented-button', {
        ...props,
        label: id === 'en' ? 'EN' : '中文',
        selected: locale === id,
        noCheckmark: true,
      })
    ) : style === 'fluent' ? (
      <ToggleButton
        {...props}
        appearance="subtle"
        checked={locale === id}
        aria-pressed={locale === id}
        tabIndex={locale === id ? 0 : -1}
        onClick={() => setLocale(id)}
      >
        {id === 'en' ? 'EN' : '中文'}
      </ToggleButton>
    ) : (
      <button
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
      {native ? (
        createElement(
          'md-outlined-segmented-button-set',
          { ref: group, 'aria-label': t('网站语言', 'Language') },
          ...options,
        )
      ) : (
        <div role="group" aria-label={t('网站语言', 'Language')}>
          {options}
        </div>
      )}
    </div>
  )
}
