import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useStoredState } from './storage'
import { flushSync } from 'react-dom'
import { translate, type Locale } from './locale'
import { FluentProvider, webDarkTheme, webLightTheme } from '@fluentui/react-components'
import { isMobileDevice } from './device'
import { useNarrowViewport } from './use-narrow-viewport'
import {
  isGlassGradient,
  isThemeAccents,
  mixColor,
  themeColorTokens,
  type OrdinaryStyle,
  type ThemeAccents,
} from './theme-colors'

const DESKTOP_PRESETS = [
  {
    id: 'windows',
    name: 'Windows',
    english: 'Windows',
    description: '清晰的窗口边框、蓝色高亮与居中任务栏。',
    game: false,
    opening: '',
  },
  {
    id: 'macos',
    name: 'macOS',
    english: 'macOS',
    description: '交通灯按钮、居中标题与程序坞。',
    game: false,
    opening: '',
  },
  {
    id: 'linux',
    name: 'Linux',
    english: 'Linux',
    description: '石墨色顶栏、圆形窗口按钮与紧凑面板。',
    game: false,
    opening: '',
  },
] as const

export const STYLE_PRESETS = [
  {
    id: 'default',
    name: '默认',
    english: 'DogOfFurina Toolbox',
    description: '薄荷绿与暖白，轻巧、安静。',
    game: false,
    opening: '',
  },
  {
    id: 'material',
    name: 'Material 3',
    english: 'MATERIAL DESIGN 3',
    description: '柔和色调、圆润形状与清晰层次。',
    game: false,
    opening: '',
  },
  {
    id: 'fluent',
    name: 'Fluent Design',
    english: 'FLUENT DESIGN',
    description: '清晰层级、细腻材质与蓝色点缀。',
    game: false,
    opening: '',
  },
  {
    id: 'glass',
    name: '液态玻璃',
    english: 'LIQUID GLASS',
    description: '流动光色、通透表面与柔和高光。',
    game: false,
    opening: '',
  },
  {
    id: 'genshin',
    name: '原神',
    english: 'A JOURNEY AMONG STARS',
    description: '星云背景、贯穿所有页面的冒险手册与书签导航。',
    game: true,
    opening: '星门开启',
  },
  {
    id: 'zenless',
    name: '绝区零',
    english: 'WELCOME TO YOUR ZONE',
    description: '荧光频道、街头海报与票券式工具卡。',
    game: true,
    opening: '频道接入',
  },
  {
    id: 'endfield',
    name: '终末地',
    english: 'YOUR NEXT FRONTIER',
    description: '动态等高线、工业终端与分栏工作台。',
    game: true,
    opening: '终端启动',
  },
  {
    id: 'minecraft',
    name: 'Minecraft',
    english: 'BUILD YOUR WORKSPACE',
    description: '方块地形、物品栏与立体制作台控件。',
    game: true,
    opening: '世界准备',
  },
  ...DESKTOP_PRESETS,
] as const

export type StyleId = (typeof STYLE_PRESETS)[number]['id']
export const isDesktopStyle = (id: StyleId) => DESKTOP_PRESETS.some((preset) => preset.id === id)
export type ThemeMode = 'light' | 'dark'
export type ThemePreference = ThemeMode | 'system'
export const isStyleId = (value: unknown): value is StyleId =>
  STYLE_PRESETS.some((style) => style.id === value)
export const presetFor = (id: StyleId) => STYLE_PRESETS.find((style) => style.id === id)!
const englishStyles = {
  default: ['Default', 'Mint green and warm white. Light and quiet.', ''],
  material: ['Material 3', 'Soft colors, rounded shapes and clear hierarchy.', ''],
  fluent: ['Fluent Design', 'Clear hierarchy, subtle materials and a blue accent.', ''],
  glass: ['Liquid Glass', 'Flowing colors, translucent surfaces and soft highlights.', ''],
  genshin: [
    'Genshin Impact',
    'Celestial scenery, a bound handbook on every page and ribbon bookmarks.',
    'Celestial gate',
  ],
  zenless: [
    'Zenless Zone Zero',
    'Neon channels, street posters and ticket-style tool cards.',
    'Channel connection',
  ],
  endfield: [
    'Arknights: Endfield',
    'Changing terrain contours, an industrial terminal and a split workbench.',
    'Terminal startup',
  ],
  minecraft: [
    'Minecraft',
    'Block landscapes, inventory slots and bevelled crafting controls.',
    'World preparation',
  ],
  windows: ['Windows', 'Crisp window borders, blue highlights and a centered taskbar.', ''],
  macos: ['macOS', 'Traffic-light buttons, centered titles and a Dock.', ''],
  linux: ['Linux', 'A graphite top bar, round window controls and a compact panel.', ''],
} as const
export const styleName = (id: StyleId, locale: Locale) =>
  translate(locale, presetFor(id).name, englishStyles[id][0])
export const styleDescription = (id: StyleId, locale: Locale) =>
  translate(locale, presetFor(id).description, englishStyles[id][1])
export const styleOpening = (id: StyleId, locale: Locale) =>
  translate(locale, presetFor(id).opening, englishStyles[id][2])

interface Appearance {
  style: StyleId
  setStyle: (style: StyleId) => void
  desktopAllowed: boolean
  desktopSelected: boolean
  mode: ThemeMode
  theme: ThemePreference
  setMode: (mode: ThemePreference) => void
  openings: boolean
  setOpenings: (enabled: boolean) => void
  reducedMotion: boolean
  sceneMotion: boolean
  setSceneMotion: (enabled: boolean) => void
  pageMotion: boolean
  setPageMotion: (enabled: boolean) => void
  accentColors: ThemeAccents
  setAccentColor: (color: string) => void
  resetAccentColor: () => void
  glassGradient: [string, string]
  setGlassGradient: (colors: [string, string]) => void
}
const AppearanceContext = createContext<Appearance>(null!)
export const useAppearance = () => useContext(AppearanceContext)

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const narrow = useNarrowViewport()
  const desktopAllowed = !narrow && !isMobileDevice()
  const [savedStyle, saveStyle] = useStoredState<StyleId>('style', 'default', isStyleId)
  const desktopSelected = isDesktopStyle(savedStyle)
  const style = desktopSelected && !desktopAllowed ? 'default' : savedStyle
  const setStyle = (next: StyleId) => {
    if (desktopAllowed || !isDesktopStyle(next)) saveStyle(next)
  }
  const [accentColors, setAccentColors] = useStoredState<ThemeAccents>(
    'theme-accents',
    {},
    isThemeAccents,
  )
  const [glassGradient, setGlassGradient] = useStoredState<[string, string]>(
    'glass-gradient',
    ['#a7d0ff', '#f0bbd8'],
    isGlassGradient,
  )
  const setAccentColor = (color: string) => {
    if (presetFor(style).game || isDesktopStyle(style)) return
    setAccentColors((colors) => ({ ...colors, [style]: color }))
  }
  const resetAccentColor = () =>
    setAccentColors((colors) => {
      const next = { ...colors }
      delete next[style as OrdinaryStyle]
      return next
    })
  const [theme, updateTheme] = useStoredState<ThemePreference>(
    'theme',
    'system',
    (value): value is ThemePreference =>
      value === 'light' || value === 'dark' || value === 'system',
  )
  const [systemMode, setSystemMode] = useState<ThemeMode>(() =>
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const mode = theme === 'system' ? systemMode : theme
  const [openings, setOpenings] = useStoredState(
    'openings',
    true,
    (value): value is boolean => typeof value === 'boolean',
  )
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [sceneMotion, setSceneMotion] = useStoredState(
    'scene-motion',
    true,
    (value): value is boolean => typeof value === 'boolean',
  )
  const [pageMotion, setPageMotion] = useStoredState(
    'page-motion',
    true,
    (value): value is boolean => typeof value === 'boolean',
  )
  const themeTransition = useRef<ViewTransition | null>(null)
  const themeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transitionTheme = (update: () => void) => {
    themeTransition.current?.skipTransition()
    if (themeTimer.current) clearTimeout(themeTimer.current)
    delete document.documentElement.dataset.themeTransition
    if (reducedMotion) update()
    else if (document.startViewTransition) {
      const transition = document.startViewTransition(() => flushSync(update))
      themeTransition.current = transition
      void transition.finished
        .catch(() => {})
        .finally(() => {
          if (themeTransition.current === transition) themeTransition.current = null
        })
    } else {
      document.documentElement.dataset.themeTransition = 'true'
      update()
      themeTimer.current = setTimeout(() => {
        delete document.documentElement.dataset.themeTransition
        themeTimer.current = null
      }, 320)
    }
  }
  const setMode = (next: ThemePreference) => {
    if (next === theme) return
    const resolved = next === 'system' ? systemMode : next
    if (resolved === mode) updateTheme(next)
    else transitionTheme(() => updateTheme(next))
  }
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const change = () => {
      const next = media.matches ? 'dark' : 'light'
      if (theme === 'system') transitionTheme(() => setSystemMode(next))
      else setSystemMode(next)
    }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [theme, reducedMotion])
  useEffect(
    () => () => {
      themeTransition.current?.skipTransition()
      if (themeTimer.current) clearTimeout(themeTimer.current)
      delete document.documentElement.dataset.themeTransition
    },
    [],
  )

  useLayoutEffect(() => {
    document.documentElement.dataset.style = style
    document.documentElement.dataset.theme = mode
    document.documentElement.dataset.sceneMotion = sceneMotion && !reducedMotion ? 'on' : 'off'
    const root = document.documentElement
    const color = accentColors[style as OrdinaryStyle]
    const tokens = themeColorTokens(color ?? '#617e53', mode === 'dark')
    for (const [name, value] of Object.entries(tokens)) {
      if (color && !presetFor(style).game) root.style.setProperty(name, value)
      else root.style.removeProperty(name)
    }
    const glassBase = mode === 'dark' ? '#101e32' : '#eef3f9'
    root.style.setProperty(
      '--glass-start',
      mixColor(glassGradient[0], glassBase, mode === 'dark' ? 0.65 : 0.42),
    )
    root.style.setProperty(
      '--glass-end',
      mixColor(glassGradient[1], glassBase, mode === 'dark' ? 0.65 : 0.42),
    )
    const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
  }, [style, mode, accentColors, glassGradient, sceneMotion, reducedMotion])

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return (
    <AppearanceContext.Provider
      value={{
        style,
        setStyle,
        desktopAllowed,
        desktopSelected,
        mode,
        theme,
        setMode,
        openings,
        setOpenings,
        reducedMotion,
        sceneMotion,
        setSceneMotion,
        pageMotion,
        setPageMotion,
        accentColors,
        setAccentColor,
        resetAccentColor,
        glassGradient,
        setGlassGradient,
      }}
    >
      <FluentProvider
        className="fluent-root"
        theme={mode === 'dark' ? webDarkTheme : webLightTheme}
        style={{
          background: 'transparent',
          color: 'inherit',
          fontFamily: 'inherit',
          minHeight: '100vh',
        }}
      >
        {children}
      </FluentProvider>
    </AppearanceContext.Provider>
  )
}
