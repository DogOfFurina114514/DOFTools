import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { TextField } from './controls'
import { useLocale } from '../lib/i18n'
import { isHexColor, THEME_COLORS } from '../lib/theme-colors'

export function ColorChoices({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (color: string) => void
}) {
  const { t } = useLocale()
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div className="theme-color-choices">
      <div className="color-swatches" role="group" aria-label={label}>
        {THEME_COLORS.map(({ color, zh, en }) => (
          <button
            type="button"
            key={color}
            className="color-swatch"
            style={{ background: color }}
            aria-label={`${label} · ${t(zh, en)}`}
            aria-pressed={value.toLowerCase() === color}
            onClick={() => onChange(color)}
          >
            {value.toLowerCase() === color && <Check size={16} />}
          </button>
        ))}
      </div>
      <div className="color-value">
        <span className="color-current" style={{ background: value }} aria-hidden="true" />
        <TextField
          label={t('{label} · 自定义颜色', '{label} · Custom color', { label })}
          value={draft}
          placeholder="#6750a4"
          error={
            draft && !isHexColor(draft)
              ? t('请输入 #RRGGBB 格式的颜色', 'Enter a color in #RRGGBB format')
              : undefined
          }
          onValueChange={(input) => {
            setDraft(input)
            if (isHexColor(input)) onChange(input.toLowerCase())
          }}
        />
      </div>
    </div>
  )
}
