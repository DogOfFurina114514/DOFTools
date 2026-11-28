import { ArrowLeft, FlaskConical } from 'lucide-react'
import { useLocale } from '../lib/i18n'
import { releaseVersion } from '../lib/release-channel'
import { ToolboxMark } from './Brand'
import { ThemedButton } from './UI'

export function BetaEntry({ onJoin }: { onJoin: () => void }) {
  const { brand, t } = useLocale()
  return (
    <main className="beta-entry">
      <ToolboxMark />
      <h1>{brand}</h1>
      <span className="version-badge">{releaseVersion}</span>
      <div className="ui-actions">
        <ThemedButton variant="primary" onClick={onJoin}>
          <FlaskConical size={17} />
          {t('参加 Beta 测试', 'Join Beta')}
        </ThemedButton>
        <a href="/">
          <ArrowLeft size={16} />
          {t('前往稳定版', 'Go to stable')}
        </a>
      </div>
    </main>
  )
}
