import { useEffect, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { useLocale } from '../lib/i18n'
import { useOnlineStatus } from '../lib/offline'
import { currentBeta, hasJoinedBeta, isBetaChannel, joinBeta, leaveBeta } from '../lib/release-channel'
import { BETA_PATH } from '../lib/site-resources'
import { ThemedButton } from './UI'

export function ReleaseChannelSettings() {
  const { t } = useLocale()
  const online = useOnlineStatus()
  const [available, setAvailable] = useState<string | null>()
  const [joined, setJoined] = useState(hasJoinedBeta)
  useEffect(() => {
    if (isBetaChannel || !online) return
    const controller = new AbortController()
    void currentBeta(controller.signal)
      .catch(() => null)
      .then((version) => {
        if (!controller.signal.aborted) setAvailable(version)
      })
    const sync = () => setJoined(hasJoinedBeta())
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('storage', sync)
      controller.abort()
    }
  }, [online])
  const status = isBetaChannel
    ? 'Beta'
    : !online
      ? t('稳定版 · Beta 需要联网', 'Stable · Beta requires a connection')
      : available === undefined
        ? t('稳定版 · 正在检查 Beta', 'Stable · Checking for Beta')
        : !available
          ? t('稳定版 · 暂无可用 Beta', 'Stable · No Beta available')
          : t('稳定版 · 可试用 {version}', 'Stable · {version} available', { version: available })

  return (
    <div className="settings-row">
      <div>
        <h3>{t('发布渠道', 'Release channel')}</h3>
        <p role="status">{status}</p>
      </div>
      <ThemedButton
        variant="secondary"
        disabled={!isBetaChannel && (!online || !available)}
        onClick={() => {
          if (isBetaChannel) leaveBeta()
          else {
            joinBeta()
            window.location.assign(BETA_PATH)
          }
        }}
      >
        <FlaskConical size={16} />
        {isBetaChannel
          ? t('退出 Beta，返回稳定版', 'Leave Beta and return to stable')
          : joined
            ? t('打开 Beta', 'Open Beta')
            : t('参加 Beta 测试', 'Join Beta')}
      </ThemedButton>
    </div>
  )
}
