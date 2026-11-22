import { Pin, PinOff } from 'lucide-react'
import { useLocale } from '../lib/i18n'

export function PinToolButton({
  title,
  pinned,
  onToggle,
}: {
  title: string
  pinned: boolean
  onToggle: () => void
}) {
  const { t } = useLocale()
  const label = pinned
    ? t('取消固定 {title}', 'Unpin {title}', { title })
    : t('固定 {title} 到侧边栏', 'Pin {title} to sidebar', { title })
  return (
    <button
      type="button"
      className="pin-tool-button"
      aria-label={label}
      title={label}
      aria-pressed={pinned}
      onClick={onToggle}
    >
      {pinned ? <PinOff size={17} /> : <Pin size={17} />}
    </button>
  )
}
