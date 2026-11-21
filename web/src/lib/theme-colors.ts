export const THEME_COLORS = [
  { color: '#617e53', zh: '薄荷绿', en: 'Mint' },
  { color: '#0f6cbd', zh: '海蓝', en: 'Ocean' },
  { color: '#6750a4', zh: '鸢尾紫', en: 'Iris' },
  { color: '#b03f73', zh: '玫瑰', en: 'Rose' },
  { color: '#af5224', zh: '珊瑚橙', en: 'Coral' },
  { color: '#8a6b16', zh: '琥珀', en: 'Amber' },
  { color: '#087e80', zh: '青碧', en: 'Teal' },
  { color: '#546375', zh: '石板灰', en: 'Slate' },
] as const
export type OrdinaryStyle = 'default' | 'material' | 'fluent' | 'glass'
export type ThemeAccents = Partial<Record<OrdinaryStyle, string>>
export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
export const isThemeAccents = (value: unknown): value is ThemeAccents =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.entries(value).every(
    ([style, color]) =>
      ['default', 'material', 'fluent', 'glass'].includes(style) && isHexColor(color),
  )
export const isGlassGradient = (value: unknown): value is [string, string] =>
  Array.isArray(value) && value.length === 2 && value.every(isHexColor)
const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
export function mixColor(first: string, second: string, proportion: number) {
  const a = rgb(first),
    b = rgb(second)
  return (
    '#' +
    a
      .map((value, index) =>
        Math.round(value * (1 - proportion) + b[index] * proportion)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}
function luminance(hex: string) {
  const linear = rgb(hex).map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}
function contrast(first: string, second: string) {
  const a = luminance(first),
    b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
export function themeColorTokens(color: string, dark: boolean) {
  const base = dark ? '#1b2230' : '#ffffff'
  let primary = color
  for (let step = 0; step <= 20 && contrast(primary, base) < 4.5; step++)
    primary = mixColor(color, dark ? '#ffffff' : '#000000', step / 20)
  const soft = mixColor(primary, base, dark ? 0.8 : 0.9)
  const onPrimary = contrast(primary, '#ffffff') >= 4.5 ? '#ffffff' : '#111827'
  return {
    '--green': primary,
    '--green-dark': dark ? primary : mixColor(primary, '#000000', 0.12),
    '--accent': primary,
    '--on-primary': onPrimary,
    '--soft-green': soft,
    '--hover': mixColor(primary, base, dark ? 0.88 : 0.94),
    '--hero': soft,
    '--hero-border': mixColor(primary, base, dark ? 0.68 : 0.78),
    '--promo': mixColor(primary, base, dark ? 0.85 : 0.94),
    '--bg': mixColor(color, dark ? '#19212c' : '#f8f9fb', 0.94),
    '--md-sys-color-primary': primary,
    '--md-sys-color-on-primary': onPrimary,
    '--md-sys-color-primary-container': soft,
    '--md-sys-color-on-primary-container': dark ? '#e9eef8' : '#202634',
    '--md-sys-color-secondary': primary,
    '--md-sys-color-secondary-container': soft,
    '--md-sys-color-on-secondary-container': dark ? '#e9eef8' : '#202634',
  }
}
