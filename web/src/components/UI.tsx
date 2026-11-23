import { type ReactNode } from 'react'
import { ArrowUpRight, Check, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { STYLE_PRESETS, useAppearance, type StyleId } from '../lib/appearance'
import { styleName, styleDescription } from '../lib/appearance'
import { useLocale } from '../lib/i18n'

export { Button as ThemedButton } from './controls'
import { Switch } from './controls'

export function PreferenceSwitch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return <Switch label={label} value={checked} onValueChange={onChange} disabled={disabled} />
}

export function StylePreview({ style, small = false }: { style: StyleId; small?: boolean }) {
  return (
    <div className={`style-preview preview-${style} ${small ? 'small' : ''}`} aria-hidden="true">
      <span className="preview-rail" />
      <span className="preview-top" />
      <span className="preview-title" />
      <span className="preview-content">
        <i />
        <i />
        <i />
      </span>
      <span className="preview-symbol">
        {style === 'genshin'
          ? '✧'
          : style === 'zenless'
            ? 'ZZZ'
            : style === 'endfield'
              ? '+'
              : style === 'minecraft'
                ? '▦'
                : ''}
      </span>
      <span className="preview-accent" />
    </div>
  )
}

export function StylePicker({ onSelect }: { onSelect: (style: StyleId) => void }) {
  const { t, locale } = useLocale()
  const { style } = useAppearance()
  return (
    <div className="style-groups">
      {[false, true].map((game) => (
        <section
          key={String(game)}
          className="style-group"
          aria-label={game ? t('游戏主题', 'Game themes') : t('普通主题', 'Standard themes')}
        >
          <div className="style-group-heading">
            <h3>{game ? t('游戏', 'Games') : t('普通', 'Standard')}</h3>
            <span>
              {game
                ? t('进入另一种世界', 'A world of your own')
                : t('日常使用的界面', 'For everyday use')}
            </span>
          </div>
          <div
            className="style-picker"
            role="radiogroup"
            aria-label={game ? t('游戏主题', 'Game themes') : t('普通主题', 'Standard themes')}
          >
            {STYLE_PRESETS.filter((preset) => preset.game === game).map((preset) => (
              <button
                type="button"
                key={preset.id}
                role="radio"
                aria-checked={style === preset.id}
                aria-label={styleName(preset.id, locale)}
                className={`style-choice ${style === preset.id ? 'chosen' : ''}`}
                onClick={() => onSelect(preset.id)}
              >
                <StylePreview style={preset.id} />
                <div className="style-choice-label">
                  <strong>{styleName(preset.id, locale)}</strong>
                  <span className="style-radio">{style === preset.id && <Check size={11} />}</span>
                </div>
                <p>{styleDescription(preset.id, locale)}</p>
                <span className="style-choice-footnote">
                  {preset.game ? (
                    <>
                      <span className="mini-dot" />
                      {t('专属界面与开屏', 'Unique interface & opening')}
                    </>
                  ) : preset.id === 'material' ? (
                    'Material 3'
                  ) : preset.id === 'fluent' ? (
                    t('简洁的分层界面', 'Clear layered surfaces')
                  ) : preset.id === 'glass' ? (
                    t('通透玻璃界面', 'Translucent surfaces')
                  ) : (
                    t('工具箱的初始模样', 'The original toolbox style')
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>
        {title}
        <span className="heading-dot">.</span>
      </h1>
      <p>{description}</p>
    </div>
  )
}

export function EmptyPanel({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: ReactNode
}) {
  const { t } = useLocale()
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link to="/settings" className="button secondary">
        {t('先挑一个喜欢的风格', 'Choose a style')}
        <ArrowUpRight size={15} />
      </Link>
    </div>
  )
}

export function PageLink({
  to,
  title,
  description,
  icon,
}: {
  to: string
  title: string
  description: string
  icon: ReactNode
}) {
  return (
    <Link to={to} className="page-link">
      <span className="page-link-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <ChevronRight size={17} />
    </Link>
  )
}
