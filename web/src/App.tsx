import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Command,
  Home,
  Menu,
  Moon,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react'
import { categories } from './data/tools'
import { isStringArray, useStoredState, readStorage, writeStorage } from './lib/storage'
import { detectAICapability } from './lib/ai'
import { AppearanceProvider, presetFor, useAppearance, type StyleId } from './lib/appearance'
import { ToolboxMark } from './components/Brand'
import { EmptyPanel, ThemedButton } from './components/UI'
import { SplashScreen } from './components/SplashScreen'
import { workspacePages } from './lib/workspace-loader'
import { PageBoundary } from './components/PageBoundary'
import { AISessionProvider } from './lib/ai-session'
import { toolRegistry, ToolWorkspace } from './tools'
import { LocaleProvider, useLocale } from './lib/i18n'
import { localize, translate, type Locale } from './lib/locale'
import { styleName } from './lib/appearance'
import { searchScore, toolSearchAliases } from './lib/search'
import { LanguageSlider } from './components/LanguageSlider'
import { IconButton } from './components/controls'
import { SetupWizard, GuidedTour } from './components/Onboarding'
import { ThemeScrollbars } from './components/ThemeScrollbars'
import { startResourceUpdates } from './lib/offline'
import { SponsorDialog } from './components/SponsorDialog'
import { TOOL_SUCCEEDED } from './lib/tool-events'
import { ResourceUpdateToast } from './components/ResourceUpdateToast'

const Dashboard = lazy(() =>
  workspacePages.dashboard().then((module) => ({ default: module.Dashboard })),
)
const SettingsPage = lazy(() =>
  workspacePages.settings().then((module) => ({ default: module.SettingsPage })),
)
const AIPage = lazy(() => workspacePages.ai().then((module) => ({ default: module.AIPage })))

// Existing tool workbenches are dormant until tools are explicitly enabled again.
interface ToolboxContext {
  favorites: string[]
  recent: string[]
  toggleFavorite: (id: string) => void
  recordUsage: (id: string) => void
  notify: (message: string) => void
}
const Toolbox = createContext<ToolboxContext>(null!)
export const useToolbox = () => useContext(Toolbox)

function useDialogFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled):not([hidden]), a[href]',
        ) ?? [],
      )
    focusable()[0]?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0],
        last = elements.at(-1)
      if (!first) return
      if (
        event.shiftKey &&
        (document.activeElement === first || !ref.current?.contains(document.activeElement))
      ) {
        event.preventDefault()
        last?.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !ref.current?.contains(document.activeElement))
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => {
      document.removeEventListener('keydown', trap)
      document.body.style.overflow = originalOverflow
      previous?.focus()
    }
  }, [ref])
}

function CategoryPage() {
  const { t, resolve } = useLocale()
  const { id } = useParams()
  const category = categories.find((item) => item.id === id)
  if (!category) return <UnavailablePage />
  const registered = toolRegistry.list().filter((tool) => tool.category === id)
  return (
    <>
      <div className="page-heading category-page-heading">
        <span className={`tool-icon large ${category.color}`}>
          <category.icon size={28} />
        </span>
        <span className="eyebrow">{category.english} · A SPACE RESERVED</span>
        <h1>
          {resolve(category.label)}
          <span className="heading-dot">.</span>
        </h1>
        <p>{resolve(category.description)}</p>
      </div>
      {registered.length ? (
        <div className="category-grid">
          {registered.map((tool) => (
            <Link key={tool.id} to={`/tool/${tool.id}`} className="category-card">
              <div>
                <h3>{resolve(tool.title)}</h3>
                <span>{resolve(tool.description)}</span>
              </div>
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyPanel
          icon={<category.icon size={34} strokeWidth={1.4} />}
          title={t('这里，先留一个位置。', 'A space for what comes next.')}
          description={t(
            '当前暂未添加工具。分类框架已经准备好，等下一份好用的灵感。',
            'No tools have been added yet. This category is ready for future additions.',
          )}
        />
      )}
    </>
  )
}

function RegisteredToolPage() {
  const { id } = useParams()
  const tool = toolRegistry.get(id ?? '')
  return tool ? <ToolWorkspace key={tool.id} tool={tool} /> : <UnavailablePage />
}

function UnavailablePage() {
  const { t } = useLocale()
  return (
    <EmptyPanel
      icon={<Search size={30} />}
      title={t('这个角落，暂时留白。', 'Nothing here just yet.')}
      description={t(
        '找不到这个工具或页面，请通过分类或搜索重新选择。',
        'This tool or page could not be found. Choose another from categories or search.',
      )}
    />
  )
}

function navigationPages(
  desktop: boolean,
  locale: Locale,
): { title: string; description: string; path: string; icon: LucideIcon }[] {
  const t = (zh: string, en: string) => translate(locale, zh, en)
  return [
    {
      title: t('工具箱概览', 'Overview'),
      description: t('你的个人小空间', 'Your personal workspace'),
      path: '/',
      icon: Home,
    },
    ...categories.map((category) => ({
      title: localize(locale, category.label),
      description: localize(locale, category.description),
      path: `/category/${category.id}`,
      icon: category.icon,
    })),
    ...(desktop
      ? [
          {
            title: t('AI 助手', 'AI assistant'),
            description: t(
              '在电脑端运行的本地多模态助手',
              'A local multimodal assistant for desktop',
            ),
            path: '/ai',
            icon: Sparkles,
          },
        ]
      : []),
    {
      title: t('设置与外观', 'Settings & appearance'),
      description: t(
        '普通与游戏主题、明暗主题与游戏开屏动画',
        'Standard and game themes, color preferences, and openings',
      ),
      path: '/settings',
      icon: Settings2,
    },
    ...toolRegistry.list().map((tool) => ({
      title: localize(locale, tool.title),
      description: localize(locale, tool.description),
      path: `/tool/${tool.id}`,
      icon: categories.find((category) => category.id === tool.category)!.icon,
    })),
  ]
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const { t, locale } = useLocale()
  const [query, setQuery] = useState('')
  const dialog = useRef<HTMLElement>(null)
  const navigate = useNavigate()
  useDialogFocus(dialog)
  const pages = navigationPages(detectAICapability().desktop, locale)
  const alternate = navigationPages(detectAICapability().desktop, locale === 'en' ? 'zh-CN' : 'en')
  const results = pages
    .map((page, index) => ({
      page,
      score: searchScore(
        query,
        `${page.title} ${page.description} ${alternate[index]?.title} ${alternate[index]?.description} ${toolSearchAliases[page.path.replace('/tool/', '')] ?? ''}`,
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.page)
  const open = (path: string) => {
    navigate(path)
    onClose()
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('搜索页面', 'Search pages')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="search-dialog-input">
          <Search size={20} />
          <input
            aria-label={t('搜索关键词', 'Search keywords')}
            placeholder={t(
              '搜索工具或要求，如 PNG 转 JPG…',
              'Search tools or tasks, e.g. PNG to JPG…',
            )}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && results[0]) {
                event.preventDefault()
                open(results[0].path)
              }
            }}
          />
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t('关闭搜索', 'Close search')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="search-results">
          <span className="search-result-label">
            {query
              ? t('找到 {count} 个页面', '{count} pages found', { count: results.length })
              : t('逛逛这个小空间', 'Explore the toolbox')}
          </span>
          {results.map((page) => (
            <button key={page.path} className="search-result" onClick={() => open(page.path)}>
              <span className="search-result-icon">
                <page.icon size={19} strokeWidth={1.6} />
              </span>
              <span>
                <strong>{page.title}</strong>
                <small>{page.description}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
          {!results.length && (
            <p className="search-no-results">
              {t('暂时没有找到，试试“设置”或“图片”。', 'No results. Try “settings” or “image”.')}
            </p>
          )}
        </div>
        <div className="search-dialog-footer">
          <span>
            <kbd>↵</kbd>
            {t('打开第一个结果', 'Open first result')}
          </span>
          <span>
            <kbd>esc</kbd>
            {t('关闭', 'Close')}
          </span>
        </div>
      </section>
    </div>
  )
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLocale()
  const dialog = useRef<HTMLElement>(null)
  useDialogFocus(dialog)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label={t('关闭使用指南', 'Close guide')}
        >
          <X size={19} />
        </button>
        <ToolboxMark className="help-logo" />
        <span className="eyebrow">A FRIENDLY LITTLE GUIDE</span>
        <h2 id="help-title">{t('欢迎来到你的小空间。', 'Welcome to your workspace.')}</h2>
        <p>
          {t(
            '从五个分类中选择工具，或搜索“PNG 转 JPG”这样的处理要求。',
            'Choose a tool from five categories, or search for a task like “PNG to JPG”.',
          )}
        </p>
        <div className="help-steps">
          <div>
            <span>01</span>
            <p>
              <strong>{t('挑一个喜欢的风格', 'Choose your style')}</strong>
              {t(
                '在设置中选择普通或游戏主题，再调整明暗。',
                'Choose a standard or game theme in settings, then adjust the colors.',
              )}
            </p>
          </div>
          <div>
            <span>02</span>
            <p>
              <strong>{t('看一段小小的开屏', 'Watch an opening')}</strong>
              {t(
                '四种游戏风格分别有开屏动画。可以跳过，也可以在设置里重播。',
                'Each game style has an opening. Skip it or replay it in settings.',
              )}
            </p>
          </div>
          <div>
            <span>03</span>
            <p>
              <strong>
                {detectAICapability().desktop
                  ? t('使用 AI 助手', 'Use AI assistant')
                  : t('搜索分类与页面', 'Search categories and pages')}
              </strong>
              {detectAICapability().desktop
                ? t(
                    '电脑端开启助手后可以对话、识别图片和处理文件，内容留在本机。',
                    'Start the assistant on desktop to chat, understand images and process files. Content stays on your device.',
                  )
                : t(
                    '右上角搜索可以直接找到分类或设置，点击结果即可前往。',
                    'Use search in the top-right corner to find categories or settings, then select a result to open it.',
                  )}
            </p>
          </div>
        </div>
        <ThemedButton className="full-width" onClick={onClose}>
          {t('开始逛逛', 'Explore')}
          <ArrowRight size={16} />
        </ThemedButton>
      </section>
    </div>
  )
}

function Application() {
  const { t, resolve, locale, brand } = useLocale()
  const { style, setStyle, mode, setMode, openings, reducedMotion } = useAppearance()
  const [favorites, setFavorites] = useStoredState('favorites', [] as string[], isStringArray)
  const [recent, setRecent] = useStoredState('recent', [] as string[], isStringArray)
  const [searchOpen, setSearchOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sponsorMode, setSponsorMode] = useState<'manual' | 'automatic' | null>(null)
  const sponsorRef = useRef(sponsorMode)
  sponsorRef.current = sponsorMode
  const [sponsorPending, setSponsorPending] = useState(false)
  const [sponsorDisabled, setSponsorDisabled] = useStoredState(
    'sponsor-reminders-disabled',
    false,
    (value): value is boolean => typeof value === 'boolean',
  )
  const [guide, setGuide] = useState<'setup' | 'tour' | null>(() =>
    readStorage<boolean>('onboarded', false) === true ? null : 'setup',
  )
  const guideRef = useRef(guide)
  guideRef.current = guide
  const [splash, setSplash] = useState<StyleId | null>(() =>
    readStorage<boolean>('onboarded', false) === true && openings && presetFor(style).game
      ? style
      : null,
  )
  const [splashSequence, setSplashSequence] = useState(0)
  const [splashRevealing, setSplashRevealing] = useState(false)
  const splashFocus = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    delete document.documentElement.dataset.bootOpening
    delete document.documentElement.dataset.bootSetup
  }, [])
  const [toast, setToast] = useState('')
  const [updatedVersion, setUpdatedVersion] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const location = useLocation()
  const desktop = detectAICapability().desktop
  const notify = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(''), 3500)
  }
  useEffect(() => {
    const ready = (event: Event) => {
      const detail = (event as CustomEvent<{ version: string; updated: boolean } | string>).detail
      if (typeof detail !== 'string' && detail.updated) {
        setUpdatedVersion(detail.version)
        return
      }
      notify(
        t(
          '离线资源已保存，可以断网使用。版本 {version}',
          'Offline resources saved. You can use the site without a connection. Version {version}',
          { version: typeof detail === 'string' ? detail : detail.version },
        ),
      )
    }
    window.addEventListener('offline-ready', ready)
    const modelsReady = () =>
      notify(
        t(
          '模型资源已保存，下次直接读取本地资源。',
          'Model resources saved. Future loads will reuse the local resources.',
        ),
      )
    window.addEventListener('models-ready', modelsReady)
    startResourceUpdates()
    return () => {
      window.removeEventListener('offline-ready', ready)
      window.removeEventListener('models-ready', modelsReady)
    }
  }, [t])
  const play = (id: StyleId) => {
    setSplashRevealing(false)
    splashFocus.current = document.activeElement as HTMLElement | null
    setSplashSequence((sequence) => sequence + 1)
    setSplash(id)
  }
  const chooseStyle = (id: StyleId) => {
    if (style === id) return
    setStyle(id)
    if (openings && presetFor(id).game) play(id)
    else setSplash(null)
  }
  const openGuide = () => {
    setSponsorMode(null)
    setSponsorPending(false)
    setSearchOpen(false)
    setHelpOpen(false)
    setMobileOpen(false)
    setSplash(null)
    setGuide('setup')
  }
  const finishSetup = (tour: boolean) => {
    writeStorage('onboarded', true)
    setGuide(tour ? 'tour' : null)
    if (tour && openings && presetFor(style).game) play(style)
  }
  useEffect(() => {
    setMobileOpen(false)
    window.scrollTo({ top: 0 })
  }, [location.pathname])
  useEffect(() => {
    const success = () => {
      if (!sponsorRef.current && !readStorage('sponsor-reminders-disabled', false))
        setSponsorPending(true)
    }
    const stored = (event: StorageEvent) => {
      if (event.key === 'fufu:sponsor-reminders-disabled' || event.key === null) {
        const disabled = readStorage(
          'sponsor-reminders-disabled',
          false,
          (value): value is boolean => typeof value === 'boolean',
        )
        setSponsorDisabled(disabled)
        if (disabled) {
          setSponsorPending(false)
          if (sponsorRef.current === 'automatic') setSponsorMode(null)
        }
      }
    }
    window.addEventListener(TOOL_SUCCEEDED, success)
    window.addEventListener('storage', stored)
    return () => {
      window.removeEventListener(TOOL_SUCCEEDED, success)
      window.removeEventListener('storage', stored)
    }
  }, [setSponsorDisabled])
  useEffect(() => {
    if (
      sponsorPending &&
      !sponsorDisabled &&
      !sponsorMode &&
      !searchOpen &&
      !helpOpen &&
      !mobileOpen &&
      !guide &&
      !splash
    ) {
      setSponsorPending(false)
      setSponsorMode('automatic')
    }
  }, [
    sponsorPending,
    sponsorDisabled,
    sponsorMode,
    searchOpen,
    helpOpen,
    mobileOpen,
    guide,
    splash,
  ])
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (sponsorRef.current) return
      if (guideRef.current === 'setup') return
      if (document.querySelector('.opening') && event.key !== 'Escape') return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setHelpOpen(false)
        setMobileOpen(false)
        setSplash(null)
      }
    }
    window.addEventListener('keydown', handle)
    return () => {
      window.removeEventListener('keydown', handle)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])
  useEffect(() => {
    if (!mobileOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [mobileOpen])
  const sectionName = location.pathname.startsWith('/category/')
    ? resolve(categories.find((category) => location.pathname.endsWith(category.id))?.label ?? '')
    : location.pathname === '/ai'
      ? t('AI 助手', 'AI assistant')
      : location.pathname === '/settings'
        ? t('设置与外观', 'Settings & appearance')
        : location.pathname === '/'
          ? t('概览', 'Overview')
          : location.pathname.startsWith('/tool/')
            ? resolve(
                toolRegistry.get(location.pathname.slice('/tool/'.length))?.title ??
                  t('工具未找到', 'Tool not found'),
              )
            : t('页面未找到', 'Page not found')
  useEffect(() => {
    document.title = `${sectionName} · ${brand}`
  }, [sectionName, brand])
  const context: ToolboxContext = {
    favorites,
    recent,
    notify,
    toggleFavorite: (id) =>
      setFavorites((previous) =>
        previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
      ),
    recordUsage: (id) =>
      setRecent((previous) => [id, ...previous.filter((item) => item !== id)].slice(0, 20)),
  }
  return (
    <Toolbox.Provider value={context}>
      <div
        className={`app-shell ${splash && !splashRevealing ? 'has-opening' : ''}`}
        inert={!!splash || guide === 'setup'}
        aria-hidden={splash || guide === 'setup' ? true : undefined}
      >
        {mobileOpen && (
          <button
            className="sidebar-backdrop"
            onClick={() => setMobileOpen(false)}
            aria-label={t('关闭导航', 'Close navigation')}
          />
        )}
        <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
          <Link to="/" className="brand">
            <ToolboxMark className="brand-mark" />
            <span>
              <strong>{brand}</strong>
              {locale === 'zh-CN' && <small>DogOfFurina Toolbox</small>}
            </span>
          </Link>
          <nav className="sidebar-nav" aria-label={t('主导航', 'Main navigation')}>
            <NavLink to="/" end className="nav-item home-nav">
              <Home size={19} />
              <span>{t('工具箱概览', 'Overview')}</span>
              <span className="nav-home-dot" />
            </NavLink>
            <span className="nav-section-label">
              {t('分类空间', 'Categories')}
              {locale === 'zh-CN' && <small>CATEGORIES</small>}
            </span>
            {categories.map((category) => (
              <NavLink to={`/category/${category.id}`} key={category.id} className="nav-item">
                <category.icon size={19} />
                <span>{resolve(category.label)}</span>
                <span className="nav-count">
                  {toolRegistry.list().filter((tool) => tool.category === category.id).length}
                </span>
              </NavLink>
            ))}
            <div className="nav-divider" />
            <span className="nav-section-label">
              {t('我的空间', 'Workspace')}
              {locale === 'zh-CN' && <small>PERSONAL</small>}
            </span>
            {desktop && (
              <NavLink to="/ai" className="nav-item" data-ai-nav>
                <Sparkles size={19} />
                <span>{t('AI 助手', 'AI assistant')}</span>
              </NavLink>
            )}
            <NavLink to="/settings" className="nav-item">
              <Settings2 size={19} />
              <span>{t('设置与外观', 'Settings & appearance')}</span>
            </NavLink>
          </nav>
          <div className="sidebar-style-note">
            <span className="status-dot" />
            <span>{styleName(style, locale)}</span>
            <span>{mode === 'light' ? 'LIGHT' : 'DARK'}</span>
          </div>
          <div className="sidebar-bottom">
            <div className="sidebar-privacy">
              <ShieldCheck size={19} />
              <div>
                <strong>{t('你的空间，在本地', 'Your workspace, on your device')}</strong>
                <small>
                  {t(
                    '无需账号，偏好保存在浏览器。',
                    'No account. Preferences stay in your browser.',
                  )}
                </small>
              </div>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <IconButton
                className="mobile-menu"
                onClick={() => setMobileOpen(true)}
                aria-label={t('打开导航', 'Open navigation')}
              >
                <Menu size={21} />
              </IconButton>
              <span className="breadcrumb-home">
                <Home size={15} />
                {t('工具箱', 'Toolbox')}
              </span>
              <ChevronRight size={13} />
              <span>{sectionName}</span>
            </div>
            <div className="topbar-actions">
              <button
                type="button"
                className="sponsor-trigger"
                onClick={() => {
                  setSearchOpen(false)
                  setHelpOpen(false)
                  setMobileOpen(false)
                  setSponsorPending(false)
                  setSponsorMode('manual')
                }}
              >
                {t('赞助', 'Sponsor')}
              </button>
              <LanguageSlider />
              <button className="search-trigger" onClick={() => setSearchOpen(true)}>
                <Search size={16} />
                <span>{t('搜索页面…', 'Search pages…')}</span>
                <kbd>
                  <Command size={10} /> K
                </kbd>
              </button>
              <span className="topbar-divider" />
              <IconButton
                onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
                aria-label={
                  mode === 'light'
                    ? t('切换深色主题', 'Switch to dark theme')
                    : t('切换浅色主题', 'Switch to light theme')
                }
              >
                {mode === 'light' ? <Sun size={19} /> : <Moon size={19} />}
              </IconButton>
              <IconButton onClick={() => setHelpOpen(true)} aria-label={t('使用指南', 'Guide')}>
                <CircleHelp size={19} />
              </IconButton>
            </div>
          </header>
          <main className="main-content">
            <PageBoundary key={location.pathname}>
              <Suspense
                fallback={
                  <div className="page-loading" role="status">
                    <span />
                    {t('正在准备页面…', 'Preparing the page…')}
                  </div>
                }
              >
                <div className="route-page">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/category/:id" element={<CategoryPage />} />
                    <Route path="/tool/:id" element={<RegisteredToolPage />} />
                    <Route path="/ai" element={<AIPage />} />
                    <Route
                      path="/settings"
                      element={
                        <SettingsPage
                          onGuide={openGuide}
                          onStyle={chooseStyle}
                          onReplay={() => {
                            if (presetFor(style).game) play(style)
                          }}
                        />
                      }
                    />
                    <Route path="*" element={<UnavailablePage />} />
                  </Routes>
                </div>
              </Suspense>
            </PageBoundary>
            <footer className="main-footer">
              <span>
                © {new Date().getFullYear()} {brand}
              </span>
              <button onClick={() => setHelpOpen(true)}>
                {t('使用指南', 'Guide')}
                <ArrowUpRight size={12} />
              </button>
            </footer>
          </main>
        </div>
      </div>
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {sponsorMode && (
        <SponsorDialog
          automatic={sponsorMode === 'automatic'}
          onClose={() => setSponsorMode(null)}
          onDismissReminders={() => {
            setSponsorDisabled(true)
            setSponsorPending(false)
            setSponsorMode(null)
            notify(
              t(
                '已关闭工具完成后的赞助提醒。',
                'Donation reminders after tool completion are now off.',
              ),
            )
          }}
        />
      )}
      {guide === 'setup' && (
        <SetupWizard
          onStyle={setStyle}
          onFinish={() => finishSetup(true)}
          onClose={() => finishSetup(false)}
        />
      )}
      {guide === 'tour' && !splash && <GuidedTour onFinish={() => setGuide(null)} />}
      <ThemeScrollbars />
      {splash && (
        <SplashScreen
          key={`${splash}-${splashSequence}`}
          style={splash}
          reducedMotion={reducedMotion}
          returnFocus={splashFocus.current}
          onReveal={() => setSplashRevealing(true)}
          onFinish={() => setSplash(null)}
        />
      )}
      {updatedVersion ? (
        <ResourceUpdateToast
          version={updatedVersion}
          onCancel={() => {
            setUpdatedVersion(null)
            notify(
              t(
                '已取消自动刷新，可稍后手动刷新。',
                'Automatic refresh cancelled. You can refresh later.',
              ),
            )
          }}
        />
      ) : (
        toast && (
          <div className="toast" role="status">
            <Check size={15} />
            {toast}
          </div>
        )
      )}
    </Toolbox.Provider>
  )
}

export default function App() {
  return (
    <LocaleProvider>
      <AppearanceProvider>
        <AISessionProvider>
          <Application />
        </AISessionProvider>
      </AppearanceProvider>
    </LocaleProvider>
  )
}
