import type { ReactNode, Ref, UIEventHandler } from 'react'
import { useAppearance } from '../lib/appearance'
import { useLocale } from '../lib/i18n'
import { useNarrowViewport } from '../lib/use-narrow-viewport'

// The handbook has two desktop leaves and one continuous page on narrow screens.
export function BookSpread({
  left,
  right,
  className = '',
  rightRef,
  onRightScroll,
}: {
  left: ReactNode
  right: ReactNode
  className?: string
  rightRef?: Ref<HTMLDivElement>
  onRightScroll?: UIEventHandler<HTMLDivElement>
}) {
  const handbook = useAppearance()?.style === 'genshin'
  const narrow = useNarrowViewport()
  const singlePage = handbook && narrow
  const { t } = useLocale()
  return (
    <div
      className={`book-spread ${className}`}
      data-scroll-area
      ref={singlePage ? rightRef : undefined}
      onScroll={singlePage ? onRightScroll : undefined}
      tabIndex={singlePage ? 0 : undefined}
      role={singlePage ? 'region' : undefined}
      aria-label={singlePage ? t('书页', 'Book page') : undefined}
    >
      <div
        className="book-leaf book-left"
        data-scroll-area
        tabIndex={handbook && !singlePage ? 0 : undefined}
        role={handbook && !singlePage ? 'region' : undefined}
        aria-label={handbook && !singlePage ? t('左页', 'Left page') : undefined}
      >
        {left}
      </div>
      <div
        className="book-leaf book-right"
        data-scroll-area
        ref={!singlePage ? rightRef : undefined}
        onScroll={!singlePage ? onRightScroll : undefined}
        tabIndex={handbook && !singlePage ? 0 : undefined}
        role={handbook && !singlePage ? 'region' : undefined}
        aria-label={handbook && !singlePage ? t('右页', 'Right page') : undefined}
      >
        {right}
      </div>
    </div>
  )
}
