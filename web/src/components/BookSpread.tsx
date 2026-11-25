import type { ReactNode, Ref, UIEventHandler } from 'react'
import { useAppearance } from '../lib/appearance'
import { useLocale } from '../lib/i18n'

// Ordinary themes flatten these wrappers; the handbook uses two physical leaves.
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
  const { t } = useLocale()
  return (
    <div className={`book-spread ${className}`}>
      <div
        className="book-leaf book-left"
        data-scroll-area
        tabIndex={handbook ? 0 : undefined}
        role={handbook ? 'region' : undefined}
        aria-label={handbook ? t('左页', 'Left page') : undefined}
      >
        {left}
      </div>
      <div
        className="book-leaf book-right"
        data-scroll-area
        ref={rightRef}
        onScroll={onRightScroll}
        tabIndex={handbook ? 0 : undefined}
        role={handbook ? 'region' : undefined}
        aria-label={handbook ? t('右页', 'Right page') : undefined}
      >
        {right}
      </div>
    </div>
  )
}
