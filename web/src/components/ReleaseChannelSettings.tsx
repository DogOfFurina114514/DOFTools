import { useEffect, useState } from 'react'
import { ArrowUpRight, RefreshCw } from 'lucide-react'
import { useLocale } from '../lib/i18n'
import { useOnlineStatus } from '../lib/offline'
import {
  compareReleases,
  hasJoinedBeta,
  installedRelease,
  isBetaChannel,
  joinBeta,
  latestRelease,
  optOutOfBeta,
  releaseSettingsPath,
  type ChannelRelease,
} from '../lib/release-channel'
import { PreferenceSwitch, ThemedButton } from './UI'

export function ReleaseChannelSettings() {
  const { t } = useLocale()
  const online = useOnlineStatus()
  const [joined, setJoined] = useState(hasJoinedBeta)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{
    joined: boolean
    attempt: number
    release: ChannelRelease | null
  }>()
  useEffect(() => {
    const sync = () => setJoined(hasJoinedBeta())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  useEffect(() => {
    if (!online) return
    const controller = new AbortController()
    void latestRelease(
      joined,
      AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    ).then((release) => {
      if (!controller.signal.aborted) setResult({ joined, attempt, release })
    })
    return () => controller.abort()
  }, [online, joined, attempt])

  const checked = result?.joined === joined && result.attempt === attempt
  const available = online && checked ? result.release : null
  const returningToStable = isBetaChannel && !joined
  const update = available && compareReleases(available, installedRelease) > 0 ? available : null
  const target = returningToStable ? releaseSettingsPath('stable') : update && releaseSettingsPath(update.channel)
  const updateStatus = !online
    ? t('离线', 'Offline')
    : !checked
      ? t('正在检查更新…', 'Checking for updates…')
      : !available
        ? t('暂时无法获取版本', 'Version unavailable')
        : update || returningToStable
          ? t('最新版本：{version}', 'Latest version: {version}', { version: available.version })
          : t('已是最新版本', 'Up to date')
  return (
    <section className="settings-panel resource-settings">
      <h2>
        <RefreshCw size={20} />
        {t('更新', 'Updates')}
      </h2>
      <div className="settings-row">
        <h3>{t('加入 Beta 测试', 'Join Beta testing')}</h3>
        <PreferenceSwitch
          label={t('加入 Beta 测试', 'Join Beta testing')}
          checked={joined}
          onChange={(value) => {
            if (value) joinBeta()
            else {
              optOutOfBeta()
              if (isBetaChannel) {
                window.location.replace(releaseSettingsPath('stable'))
                return
              }
            }
            setResult(undefined)
            setJoined(value)
          }}
        />
      </div>
      <div className="resource-status">
        <strong role="status">{updateStatus}</strong>
        <p>{t('当前版本：{version}', 'Current version: {version}', installedRelease)}</p>
        <div className="resource-actions">
          <ThemedButton
            variant="secondary"
            disabled={!online || !checked}
            onClick={() => setAttempt((previous) => previous + 1)}
          >
            <RefreshCw size={15} />
            {t('检查更新', 'Check for updates')}
          </ThemedButton>
          {target && (
            <ThemedButton
              variant="secondary"
              onClick={() => window.location.assign(target)}
            >
              <ArrowUpRight size={16} />
              {returningToStable ? t('返回稳定版', 'Return to stable') : t('立即更新', 'Update now')}
            </ThemedButton>
          )}
        </div>
      </div>
    </section>
  )
}
