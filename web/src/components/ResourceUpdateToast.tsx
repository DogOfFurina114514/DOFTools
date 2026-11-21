import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useLocale } from '../lib/i18n'

export function ResourceUpdateToast({
  version,
  onCancel,
}: {
  version: string
  onCancel: () => void
}) {
  const { t } = useLocale()
  const [seconds, setSeconds] = useState(5)
  useEffect(() => {
    const deadline = Date.now() + 5000
    setSeconds(5)
    const countdown = setInterval(
      () => setSeconds(Math.max(1, Math.ceil((deadline - Date.now()) / 1000))),
      250,
    )
    const refresh = setTimeout(() => window.location.reload(), 5000)
    return () => {
      clearInterval(countdown)
      clearTimeout(refresh)
    }
  }, [version])
  return (
    <div className="toast resource-update-toast" role="status">
      <Check size={15} aria-hidden="true" />
      <span>
        {t(
          '离线资源已更新至 {version}，{seconds} 秒后自动刷新。',
          'Offline resources updated to {version}. Refreshing in {seconds} seconds.',
          { version, seconds },
        )}
      </span>
      <button type="button" className="toast-cancel" onClick={onCancel}>
        {t('取消刷新', 'Cancel refresh')}
      </button>
    </div>
  )
}
