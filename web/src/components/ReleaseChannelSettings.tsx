import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useLocale } from '../lib/i18n'
import { useOnlineStatus } from '../lib/offline'
import {
  currentRelease,
  hasJoinedBeta,
  isBetaChannel,
  joinBeta,
  leaveBeta,
  optOutOfBeta,
  releaseVersion,
} from '../lib/release-channel'
import { BETA_PATH } from '../lib/site-resources'
import { PreferenceSwitch, ThemedButton } from './UI'

export function ReleaseChannelSettings() {
  const { t } = useLocale()
  const online = useOnlineStatus()
  const [stable, setStable] = useState<string | null>()
  const [beta, setBeta] = useState<string | null>()
  const [joined, setJoined] = useState(() => isBetaChannel || hasJoinedBeta())
  useEffect(() => {
    const sync = () => setJoined(hasJoinedBeta())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  useEffect(() => {
    if (!online) return
    const controller = new AbortController()
    const check = (channel: 'stable' | 'beta', update: (version: string | null) => void) =>
      void currentRelease(channel, controller.signal)
        .catch(() => null)
        .then((version) => {
          if (!controller.signal.aborted) update(version)
        })
    check('stable', setStable)
    if (joined) check('beta', setBeta)
    return () => controller.abort()
  }, [online, joined])

  const stableVersion = stable ?? (!isBetaChannel ? releaseVersion : undefined)
  const canOpenStable = isBetaChannel || (online && stable && stable !== releaseVersion)
  const canOpenBeta = online && beta && (!isBetaChannel || beta !== releaseVersion)

  return (
    <>
      <div className="settings-row">
        <div>
          <h3>{t('发布渠道', 'Release channel')}</h3>
          <p>{t('参加 Beta 测试', 'Join Beta testing')}</p>
        </div>
        <PreferenceSwitch
          label={t('参加 Beta 测试', 'Join Beta testing')}
          checked={joined}
          onChange={(value) => {
            if (value) joinBeta()
            else if (isBetaChannel) {
              leaveBeta()
              return
            } else {
              optOutOfBeta()
              setBeta(undefined)
            }
            setJoined(value)
          }}
        />
      </div>
      <div className="settings-row">
        <div>
          <h3>{t('最新稳定版', 'Latest stable')}</h3>
          <p role="status">{stableVersion ?? t('版本暂不可用', 'Version unavailable')}</p>
        </div>
        {canOpenStable && (
          <ThemedButton variant="secondary" onClick={() => window.location.assign('/settings')}>
            <ArrowUpRight size={16} />
            {t('打开稳定版', 'Open stable')}
          </ThemedButton>
        )}
      </div>
      {joined && (
        <div className="settings-row">
          <div>
            <h3>{t('最新 Beta', 'Latest Beta')}</h3>
            <p role="status">
              {beta ??
                (isBetaChannel
                  ? releaseVersion
                  : !online
                    ? t('Beta 需要联网', 'Beta requires a connection')
                    : beta === undefined
                      ? t('正在检查 Beta', 'Checking for Beta')
                      : t('暂无可用 Beta', 'No Beta available'))}
            </p>
          </div>
          {canOpenBeta && (
            <ThemedButton variant="secondary" onClick={() => window.location.assign(BETA_PATH)}>
              <ArrowUpRight size={16} />
              {t('打开 Beta', 'Open Beta')}
            </ThemedButton>
          )}
        </div>
      )}
    </>
  )
}
