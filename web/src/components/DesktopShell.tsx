import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  Apple,
  CircleHelp,
  Columns2,
  Ellipsis,
  FolderOpen,
  Grid3X3,
  Heart,
  Minus,
  Monitor,
  Moon,
  PanelsTopLeft,
  Pin,
  PinOff,
  Search,
  Settings,
  SlidersHorizontal,
  Square,
  Sun,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useAppearance } from '../lib/appearance'
import { useLocale } from '../lib/i18n'
import { useOnlineStatus } from '../lib/offline'
import { isStringArray, useStoredState } from '../lib/storage'
import { filterTools } from '../lib/tool-filter'
import { toolRegistry } from '../tools/registry'
import { ToolboxMark } from './Brand'
import {
  DesktopAppGlyph,
  DesktopAppIcon,
  desktopAppDragProps,
  desktopAppDragType,
  desktopAppFromKey,
  desktopAppKey,
  desktopAppTitle,
  primaryPrograms,
  programApp,
  type DesktopApp,
  type DesktopProgram,
} from './DesktopApp'
import {
  DesktopWindows,
  type DesktopWindow,
  type DesktopWindowActions,
  type DesktopWindowManager,
} from './DesktopWindows'
import { LanguageSlider } from './LanguageSlider'

type MenuId =
  | 'launcher'
  | 'system'
  | 'apple'
  | 'file'
  | 'window'
  | 'overflow'
  | 'taskbar-context'
  | `app:${string}`
  | `task:${string}`
  | `title:${number}`
type Menu = { id: MenuId; anchor: number; top: boolean; point?: { x: number; y: number } }
type AppGroup = { app: DesktopApp; windows: DesktopWindow[] }

function DesktopClock({
  showDate = false,
  inlineDate = false,
}: {
  showDate?: boolean
  inlineDate?: boolean
}) {
  const { locale } = useLocale()
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const tick = window.setInterval(() => setTime(new Date()), 5000)
    return () => window.clearInterval(tick)
  }, [])
  const date = new Intl.DateTimeFormat(locale, {
    month: inlineDate ? 'short' : 'numeric',
    day: 'numeric',
    ...(inlineDate ? { weekday: 'short' } : { year: 'numeric' }),
  }).format(time)
  const clock = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(time)
  return (
    <time
      className={`desktop-clock ${inlineDate ? 'desktop-clock-inline' : ''}`}
      dateTime={time.toISOString()}
    >
      {inlineDate && showDate && <span>{date}</span>}
      <span>{clock}</span>
      {!inlineDate && showDate && <span>{date}</span>}
    </time>
  )
}

function DesktopChrome({
  manager,
  actions,
  pinned,
  onSponsor,
}: {
  manager: DesktopWindowManager
  actions: DesktopWindowActions
  pinned: string[]
  onSponsor: () => void
}) {
  const { t, resolve, brand } = useLocale()
  const { style, mode, setMode } = useAppearance()
  const online = useOnlineStatus()
  const mac = style === 'macos'
  const linux = style === 'linux'
  const windows = style === 'windows'
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLElement>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [query, setQuery] = useState('')
  const [selectedShortcut, setSelectedShortcut] = useState<string>()
  const [dropTarget, setDropTarget] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const savedDesktop = useRef<number[]>([])
  const { active, canTile, tile } = actions

  const pins = pinned.flatMap((id): DesktopApp[] => {
    const tool = toolRegistry.get(id)
    return tool ? [{ kind: 'tool', tool }] : []
  })
  const shortcuts = [...primaryPrograms.map(programApp), ...pins]
  const [taskPins, setTaskPins] = useStoredState(
    'desktop-task-pins',
    shortcuts.map(desktopAppKey),
    isStringArray,
  )
  const favorites = taskPins.flatMap((key) => desktopAppFromKey(key) ?? [])
  const setTaskPin = (key: string, pin: boolean) =>
    setTaskPins((previous) =>
      pin
        ? previous.includes(key)
          ? previous
          : [...previous, key]
        : previous.filter((item) => item !== key),
    )
  const appLabel = (app: DesktopApp) => resolve(desktopAppTitle(app, style))
  const pinLabel = (pinned: boolean) =>
    mac
      ? pinned
        ? t('从程序坞移除', 'Remove from Dock')
        : t('保留在程序坞', 'Keep in Dock')
      : pinned
        ? t('从任务栏取消固定', 'Unpin from taskbar')
        : t('固定到任务栏', 'Pin to taskbar')
  const programs = [...primaryPrograms, 'overview', 'help'] as const
  const groups = new Map<string, AppGroup>(
    favorites.map((app) => [desktopAppKey(app), { app, windows: [] }]),
  )
  for (const item of manager.windows) {
    const key = desktopAppKey(item.app)
    const group = groups.get(key)
    if (group) group.windows.push(item)
    else groups.set(key, { app: item.app, windows: [item] })
  }
  const list = [...manager.windows].sort((a, b) => a.id - b.id)
  // Reserve space for launcher and system controls before laying out running apps.
  const available = windows
    ? Math.min(780, size.width - 236) - 100
    : mac
      ? size.width - 146
      : size.height - 96
  const iconSpan = windows ? 45 : mac ? 52 : 49
  const withLabels = windows && groups.size * 122 - 4 <= available
  const limit = Math.max(1, Math.floor((available + 4) / iconSpan))
  const groupEntries = [...groups]
  const overflow = groupEntries.length > limit && !withLabels
  const visibleGroups = overflow ? groupEntries.slice(0, limit - 1) : groupEntries
  const hiddenGroups = overflow ? groupEntries.slice(limit - 1) : []
  const moreLabel = t('更多应用', 'More apps')
  const filtered =
    menu?.id === 'launcher'
      ? [
          ...programs
            .map(programApp)
            .filter((app) =>
              appLabel(app).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
            ),
          ...filterTools(toolRegistry.list(), query, []).map((tool): DesktopApp => ({
            kind: 'tool',
            tool,
          })),
        ]
      : []
  const favoritesInLauncher = windows && !query.trim()
  const close = () => setMenu(null)
  const openMenu = (id: MenuId, button: HTMLElement) => {
    if (menu?.id === id && trigger.current === button) {
      close()
      return
    }
    trigger.current = button
    if (id === 'launcher') setQuery('')
    const bounds = button.getBoundingClientRect()
    const host = root.current?.getBoundingClientRect()
    setMenu({
      id,
      anchor: bounds.left + bounds.width / 2 - (host?.left ?? 0),
      top: Boolean(button.closest('.desktop-top-panel')),
    })
  }
  useLayoutEffect(() => {
    const host = root.current
    if (!host) return
    const measure = () => setSize({ width: host.clientWidth, height: host.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    measure()
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const host = root.current?.closest<HTMLElement>('.desktop-shell')
    if (!host) return
    const context = (event: MouseEvent) => {
      event.preventDefault()
      if (!(event.target instanceof Element) || !host.contains(event.target)) {
        setMenu(null)
        return
      }
      const target = event.target
      const titlebar = target.closest<HTMLElement>('.desktop-window-bar')
      const taskbar = target.closest<HTMLElement>('.desktop-taskbar, .desktop-top-panel')
      const task = target.closest<HTMLButtonElement>('[data-task-app]')
      const app = target.closest<HTMLButtonElement>('[data-desktop-app]')
      const surface = titlebar ?? task ?? app ?? taskbar
      if (!surface) {
        setMenu(null)
        return
      }
      const frame = titlebar?.closest<HTMLElement>('[data-desktop-window]')
      const appKey = app?.dataset.desktopApp
      if (appKey && app?.closest('.desktop-shortcuts')) setSelectedShortcut(appKey)
      const id: MenuId = frame
        ? `title:${Number(frame.dataset.desktopWindow)}`
        : task?.dataset.taskApp
          ? `task:${task.dataset.taskApp}`
          : appKey
            ? `app:${appKey}`
            : 'taskbar-context'
      const focus =
        frame ??
        target.closest('button') ??
        host.querySelector<HTMLElement>('[data-desktop-launch]')
      trigger.current = focus
      const area = host.getBoundingClientRect()
      const origin = (focus ?? surface).getBoundingClientRect()
      const atPointer = event.clientX !== 0 || event.clientY !== 0
      const x = (atPointer ? event.clientX : origin.left + origin.width / 2) - area.left
      const y = (atPointer ? event.clientY : origin.bottom) - area.top
      setMenu({ id, anchor: x, top: false, point: { x, y } })
    }
    const clearSelection = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        host.contains(event.target) &&
        !event.target.closest('.desktop-shortcuts .desktop-app-tile, .desktop-popup')
      )
        setSelectedShortcut(undefined)
    }
    const clearDropTarget = () => setDropTarget(false)
    document.addEventListener('contextmenu', context)
    document.addEventListener('pointerdown', clearSelection)
    document.addEventListener('dragend', clearDropTarget)
    return () => {
      document.removeEventListener('contextmenu', context)
      document.removeEventListener('pointerdown', clearSelection)
      document.removeEventListener('dragend', clearDropTarget)
    }
  }, [])
  useLayoutEffect(() => {
    if (!menu?.point || !panel.current || !root.current) return
    const { point } = menu
    const popup = panel.current
    const host = root.current
    const position = () => {
      const left = Math.max(6, Math.min(point.x, host.clientWidth - popup.offsetWidth - 6))
      const belowFits = point.y + popup.offsetHeight <= host.clientHeight - 6
      const top = Math.max(
        6,
        Math.min(
          belowFits ? point.y : point.y - popup.offsetHeight,
          host.clientHeight - popup.offsetHeight - 6,
        ),
      )
      popup.style.left = `${left}px`
      popup.style.top = `${top}px`
    }
    const observer = new ResizeObserver(position)
    observer.observe(host)
    observer.observe(popup)
    position()
    return () => observer.disconnect()
  }, [menu])
  useEffect(() => {
    if (!menu) return
    const previous = trigger.current
    const first = panel.current?.querySelector<HTMLElement>(
      menu.id === 'launcher' ? 'input' : 'button:not(:disabled)',
    )
    first?.focus({ preventScroll: true })
    const pointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) close()
    }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      close()
      previous?.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('keydown', keyboard, true)
    return () => {
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('keydown', keyboard, true)
    }
  }, [menu])
  useEffect(() => {
    setMenu(null)
  }, [style])
  useEffect(() => {
    if (!overflow && menu?.id === 'overflow') setMenu(null)
  }, [overflow, menu?.id])

  const reveal = (id: number) => {
    close()
    manager.raise(id)
    requestAnimationFrame(() =>
      document.getElementById(`tool-window-${id}`)?.focus({ preventScroll: true }),
    )
  }
  const launch = (app: DesktopApp) => {
    close()
    if (app.kind === 'tool') manager.open(app.tool.id)
    else {
      const existing = groups.get(desktopAppKey(app))?.windows[0]
      if (existing) reveal(existing.id)
      else manager.openProgram(app.program)
    }
  }
  const minimize = (id: number) => manager.update(id, { minimized: true })
  const toggleDesktop = () => {
    close()
    const showing = manager.windows.filter((item) => !item.minimized).map((item) => item.id)
    if (showing.length) {
      savedDesktop.current = showing
      manager.showDesktop()
    } else {
      for (const id of savedDesktop.current) manager.raise(id)
      savedDesktop.current = []
    }
  }
  const toggleSize = (item: DesktopWindow) =>
    manager.update(item.id, { maximized: !item.maximized })
  const launcherLabel = t(
    windows ? '开始' : linux ? '应用程序' : '启动台',
    windows ? 'Start' : linux ? 'Applications' : 'Launchpad',
  )
  const taskLabel = t(mac ? '窗口' : '任务视图', mac ? 'Window' : 'Task View')
  const showDesktopLabel = t('显示桌面', 'Show desktop')
  const systemLabel = t('控制中心', 'Control Center')
  const modeLabel =
    mode === 'dark' ? t('浅色外观', 'Light appearance') : t('深色外观', 'Dark appearance')

  const appTile = (app: DesktopApp, shortcut = false) => {
    const key = desktopAppKey(app)
    return (
      <button
        type="button"
        key={key}
        className="desktop-app-tile"
        aria-pressed={shortcut ? selectedShortcut === key : undefined}
        title={appLabel(app)}
        {...desktopAppDragProps(app)}
        onClick={(event) => {
          if (shortcut) setSelectedShortcut(key)
          // A keyboard-activated button click has no pointer click count.
          if (!shortcut || event.detail === 0) launch(app)
        }}
        onDoubleClick={shortcut ? () => launch(app) : undefined}
      >
        <DesktopAppGlyph app={app} />
        <span>{appLabel(app)}</span>
      </button>
    )
  }
  const menuButton = (id: MenuId, label: string, icon?: ReactNode, className = '') => (
    <button
      type="button"
      className={`desktop-panel-button ${className}`}
      aria-expanded={menu?.id === id}
      aria-label={label}
      title={label}
      data-desktop-launch={id === 'launcher' ? '' : undefined}
      onClick={(event) => openMenu(id, event.currentTarget)}
    >
      {icon ?? label}
    </button>
  )
  const systemMenu = menuButton(
    'system',
    systemLabel,
    <>
      {online ? <Wifi size={16} /> : <WifiOff size={16} />}
      <SlidersHorizontal size={15} />
      {windows && <DesktopClock showDate />}
    </>,
    'desktop-system-toggle',
  )
  const switcher = (entries: DesktopWindow[]) => (
    <div className="desktop-window-menu-list">
      {entries.map((item) => (
        <button
          type="button"
          key={item.id}
          aria-current={active?.id === item.id || undefined}
          onClick={() => reveal(item.id)}
        >
          <DesktopAppIcon app={item.app} size={16} />
          <span>{appLabel(item.app)}</span>
          {item.app.kind === 'tool' && <small>#{item.id}</small>}
          {item.minimized && <Minus size={13} />}
        </button>
      ))}
    </div>
  )
  const taskMenu = menu?.id.startsWith('task:') ? groups.get(menu.id.slice(5)) : undefined
  const shortcutMenu = menu?.id.startsWith('app:') ? desktopAppFromKey(menu.id.slice(4)) : undefined
  const titleMenu = menu?.id.startsWith('title:')
    ? manager.windows.find((item) => item.id === Number(menu.id.slice(6)))
    : undefined
  const launchNew = (app: DesktopApp) => {
    if (app.kind === 'tool') launch(app)
  }
  const runCommand = (run: () => void) => {
    const previous = trigger.current
    close()
    run()
    requestAnimationFrame(() => {
      if (document.activeElement === document.body && !previous?.closest('[hidden]'))
        (previous?.isConnected
          ? previous
          : root.current?.querySelector<HTMLElement>('[data-desktop-launch], .desktop-task')
        )?.focus({ preventScroll: true })
    })
  }
  const pinCommand = (app: DesktopApp) => {
    const key = desktopAppKey(app)
    const pinned = taskPins.includes(key)
    return (
      <button type="button" onClick={() => runCommand(() => setTaskPin(key, !pinned))}>
        {pinned ? <PinOff size={16} /> : <Pin size={16} />}
        {pinLabel(pinned)}
      </button>
    )
  }
  const selectGroup = (key: string, group: AppGroup, button: HTMLButtonElement) => {
    if (group.windows.length > 1) {
      const anchor = menu?.id === 'overflow' ? (trigger.current ?? button) : button
      openMenu(`task:${key}`, anchor)
    } else if (group.windows[0]) {
      const item = group.windows[0]
      if (active?.id === item.id && !mac) {
        close()
        minimize(item.id)
      } else reveal(item.id)
    } else launch(group.app)
  }

  return (
    <div className="desktop-chrome" ref={root} data-native-scroll>
      <div className="desktop-shortcuts" aria-label={t('桌面快捷方式', 'Desktop shortcuts')}>
        {shortcuts.slice(0, 9).map((app) => appTile(app, true))}
      </div>
      {(mac || linux) && (
        <header className="desktop-top-panel">
          <div className="desktop-panel-leading">
            {mac ? (
              <>
                {menuButton('apple', brand, <Apple size={17} />)}
                <strong className="desktop-front-app">
                  {active ? appLabel(active.app) : brand}
                </strong>
                {menuButton('file', t('文件', 'File'))}
                {menuButton('window', taskLabel)}
                <button
                  type="button"
                  className="desktop-panel-button"
                  onClick={() => launch(programApp('help'))}
                >
                  {t('帮助', 'Help')}
                </button>
              </>
            ) : (
              menuButton(
                'launcher',
                launcherLabel,
                <>
                  <Grid3X3 size={16} />
                  {launcherLabel}
                </>,
              )
            )}
          </div>
          {linux && <DesktopClock showDate inlineDate />}
          <div className="desktop-panel-trailing">
            {systemMenu}
            {mac && <DesktopClock showDate inlineDate />}
          </div>
        </header>
      )}
      <nav
        className="desktop-taskbar"
        aria-label={t(mac ? '程序坞' : '任务栏', mac ? 'Dock' : 'Taskbar')}
        data-pin-target={dropTarget || undefined}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(desktopAppDragType)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDropTarget(true)
        }}
        onDragLeave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          )
            setDropTarget(false)
        }}
        onDrop={(event) => {
          setDropTarget(false)
          if (!event.dataTransfer.types.includes(desktopAppDragType)) return
          event.preventDefault()
          const app = desktopAppFromKey(event.dataTransfer.getData(desktopAppDragType))
          if (!app) return
          setTaskPin(desktopAppKey(app), true)
          close()
        }}
      >
        <div className="desktop-task-cluster">
          {windows &&
            menuButton(
              'launcher',
              launcherLabel,
              <span className="desktop-start-mark" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>,
              'desktop-launch-button',
            )}
          {windows &&
            menuButton('window', taskLabel, <PanelsTopLeft size={19} />, 'desktop-view-button')}
          <div className="desktop-task-list" data-labels={withLabels}>
            {visibleGroups.map(([key, group]) => {
              const { app, windows: running } = group
              const label = appLabel(app)
              const foreground = running.some((item) => item.id === active?.id)
              const panelId = `task:${key}` as const
              return (
                <button
                  type="button"
                  key={key}
                  className="desktop-task"
                  title={running.length > 1 ? `${label} (${running.length})` : label}
                  aria-label={
                    running.length > 1
                      ? t('{app}，{count} 个窗口', '{app}, {count} windows', {
                          app: label,
                          count: running.length,
                        })
                      : label
                  }
                  aria-pressed={foreground}
                  aria-expanded={running.length > 1 ? menu?.id === panelId : undefined}
                  data-running={running.length > 0}
                  data-minimized={running.length > 0 && running.every((item) => item.minimized)}
                  data-task-app={key}
                  onClick={(event) => selectGroup(key, group, event.currentTarget)}
                >
                  <DesktopAppGlyph app={app} />
                  {withLabels && <span className="desktop-task-label">{label}</span>}
                </button>
              )
            })}
            {overflow && (
              <button
                type="button"
                className="desktop-task desktop-task-overflow"
                aria-label={moreLabel}
                aria-expanded={menu?.id === 'overflow'}
                title={moreLabel}
                onClick={(event) => openMenu('overflow', event.currentTarget)}
              >
                <Ellipsis size={20} />
              </button>
            )}
          </div>
          {!windows &&
            menuButton(
              'window',
              taskLabel,
              <PanelsTopLeft size={mac ? 23 : 19} />,
              'desktop-view-button',
            )}
        </div>
        {windows && (
          <div className="desktop-tray">
            {systemMenu}
            <button
              type="button"
              className="desktop-show-strip"
              title={showDesktopLabel}
              aria-label={showDesktopLabel}
              onClick={toggleDesktop}
            />
          </div>
        )}
      </nav>
      {menu && (
        <>
          {menu.id === 'launcher' && !windows && (
            <button
              type="button"
              className="desktop-overview-scrim"
              tabIndex={-1}
              onClick={close}
              aria-label={t('关闭应用列表', 'Close app launcher')}
            />
          )}
          <section
            ref={panel}
            className="desktop-popup"
            data-menu={taskMenu ? 'tasks' : menu.id}
            data-anchor={menu.top ? 'top' : undefined}
            data-point={Boolean(menu.point)}
            aria-label={
              menu.id === 'launcher'
                ? launcherLabel
                : taskMenu
                  ? appLabel(taskMenu.app)
                  : shortcutMenu
                    ? appLabel(shortcutMenu)
                    : titleMenu || menu.id === 'window' || menu.id === 'taskbar-context'
                      ? taskLabel
                      : menu.id === 'overflow'
                        ? moreLabel
                        : systemLabel
            }
            key={menu.point ? 'context' : 'anchored'}
            style={{ '--desktop-menu-anchor': `${menu.anchor}px` } as CSSProperties}
          >
            {menu.id === 'launcher' ? (
              <>
                <div className="desktop-launch-search">
                  <Search size={18} />
                  <input
                    type="search"
                    aria-label={t('搜索应用', 'Search apps')}
                    placeholder={t('搜索应用', 'Search apps')}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.nativeEvent.isComposing && filtered[0])
                        launch(filtered[0])
                    }}
                  />
                </div>
                <div className="desktop-launch-results">
                  {favoritesInLauncher && (
                    <>
                      <h2>{t('已固定', 'Pinned')}</h2>
                      <div className="desktop-launch-grid">
                        {favorites.map((app) => appTile(app))}
                      </div>
                    </>
                  )}
                  {favoritesInLauncher && <h2>{t('所有应用', 'All apps')}</h2>}
                  {filtered.length ? (
                    <div className="desktop-launch-grid">{filtered.map((app) => appTile(app))}</div>
                  ) : (
                    <p className="desktop-popup-empty" role="status">
                      {t('找不到匹配的应用', 'No matching apps')}
                    </p>
                  )}
                </div>
                {windows && (
                  <div className="desktop-launch-footer">
                    <ToolboxMark />
                    <strong>{brand}</strong>
                    <button
                      type="button"
                      onClick={() => launch(programApp('settings'))}
                      title={t('设置', 'Settings')}
                      aria-label={t('设置', 'Settings')}
                    >
                      <Settings size={19} />
                    </button>
                  </div>
                )}
              </>
            ) : menu.id === 'system' ? (
              <div className="desktop-system-content">
                <p className="desktop-network">
                  {online ? <Wifi size={19} /> : <WifiOff size={19} />}
                  {online ? t('已联网', 'Online') : t('离线', 'Offline')}
                </p>
                <LanguageSlider />
                <button type="button" onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}>
                  {mode === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                  {modeLabel}
                </button>
                <button type="button" onClick={() => launch(programApp('settings'))}>
                  <Settings size={17} />
                  {t('设置', 'Settings')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    onSponsor()
                  }}
                >
                  <Heart size={17} />
                  {t('赞助', 'Sponsor')}
                </button>
              </div>
            ) : menu.id === 'apple' || menu.id === 'file' ? (
              <div className="desktop-menu-commands">
                {menu.id === 'apple' ? (
                  <>
                    <button type="button" onClick={() => launch(programApp('catalog'))}>
                      <Grid3X3 size={16} />
                      {appLabel(programApp('catalog'))}
                    </button>
                    <button type="button" onClick={() => launch(programApp('overview'))}>
                      <Monitor size={16} />
                      {t('关于工具箱', 'About This Toolbox')}
                    </button>
                    <button type="button" onClick={() => launch(programApp('settings'))}>
                      <Settings size={16} />
                      {t('系统设置', 'System Settings')}
                    </button>
                    <button type="button" onClick={() => launch(programApp('help'))}>
                      <CircleHelp size={16} />
                      {t('帮助', 'Help')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        close()
                        onSponsor()
                      }}
                    >
                      <Heart size={16} />
                      {t('赞助', 'Sponsor')}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => launch(programApp('catalog'))}>
                      <DesktopAppIcon app={programApp('catalog')} size={16} />
                      {appLabel(programApp('catalog'))}
                    </button>
                    {active?.app.kind === 'tool' && (
                      <button type="button" onClick={() => launchNew(active.app)}>
                        <Square size={16} />
                        {t('新建窗口', 'New Window')}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!active}
                      onClick={() => {
                        close()
                        if (active) manager.close(active.id)
                      }}
                    >
                      <X size={16} />
                      {t('关闭窗口', 'Close Window')}
                    </button>
                  </>
                )}
              </div>
            ) : menu.id === 'overflow' ? (
              <div className="desktop-window-menu-list">
                {hiddenGroups.map(([key, group]) => (
                  <button
                    type="button"
                    key={key}
                    data-task-app={key}
                    onClick={(event) => selectGroup(key, group, event.currentTarget)}
                    aria-current={group.windows.some((item) => item.id === active?.id) || undefined}
                  >
                    <DesktopAppIcon app={group.app} size={16} />
                    <span>{appLabel(group.app)}</span>
                    {group.windows.length > 0 && <small>{group.windows.length}</small>}
                  </button>
                ))}
              </div>
            ) : titleMenu ? (
              <div className="desktop-menu-commands">
                <button
                  type="button"
                  disabled={!titleMenu.maximized}
                  onClick={() => runCommand(() => toggleSize(titleMenu))}
                >
                  <PanelsTopLeft size={16} />
                  {t('还原大小', 'Restore Size')}
                </button>
                <button type="button" onClick={() => runCommand(() => minimize(titleMenu.id))}>
                  <Minus size={16} />
                  {t('最小化', 'Minimize')}
                </button>
                <button
                  type="button"
                  disabled={titleMenu.maximized}
                  onClick={() => runCommand(() => toggleSize(titleMenu))}
                >
                  <Square size={16} />
                  {t('最大化', 'Maximize')}
                </button>
                <button type="button" onClick={() => runCommand(() => manager.close(titleMenu.id))}>
                  <X size={16} />
                  {t('关闭窗口', 'Close Window')}
                </button>
              </div>
            ) : menu.id === 'taskbar-context' ? (
              <div className="desktop-menu-commands">
                <button type="button" onClick={() => setMenu({ ...menu, id: 'window' })}>
                  <PanelsTopLeft size={16} />
                  {taskLabel}
                </button>
                <button type="button" disabled={!canTile} onClick={() => runCommand(tile)}>
                  <Columns2 size={16} />
                  {t('平铺窗口', 'Tile Windows')}
                </button>
                <button type="button" disabled={!list.length} onClick={toggleDesktop}>
                  <Monitor size={16} />
                  {showDesktopLabel}
                </button>
                <button type="button" onClick={() => launch(programApp('settings'))}>
                  <Settings size={16} />
                  {t('设置', 'Settings')}
                </button>
              </div>
            ) : shortcutMenu ? (
              <div className="desktop-menu-commands">
                <button type="button" onClick={() => launch(shortcutMenu)}>
                  <FolderOpen size={16} />
                  {t('打开', 'Open')}
                </button>
                {pinCommand(shortcutMenu)}
              </div>
            ) : taskMenu ? (
              <>
                {switcher([...taskMenu.windows].sort((a, b) => a.id - b.id))}
                <div className="desktop-menu-commands">
                  {taskMenu.app.kind === 'tool' ? (
                    <button type="button" onClick={() => launchNew(taskMenu.app)}>
                      <Square size={16} />
                      {t('新建窗口', 'New Window')}
                    </button>
                  ) : (
                    !taskMenu.windows.length && (
                      <button type="button" onClick={() => launch(taskMenu.app)}>
                        <Square size={16} />
                        {t('打开', 'Open')}
                      </button>
                    )
                  )}
                  {menu.point &&
                  taskMenu.app.kind === 'program' &&
                  taskMenu.app.program === 'missing'
                    ? null
                    : menu.point && pinCommand(taskMenu.app)}
                  {taskMenu.windows.length > 0 && menu.point && (
                    <button
                      type="button"
                      onClick={() =>
                        runCommand(() => taskMenu.windows.forEach((item) => manager.close(item.id)))
                      }
                    >
                      <X size={16} />
                      {taskMenu.windows.length === 1
                        ? t('关闭窗口', 'Close Window')
                        : t('关闭所有窗口', 'Close All Windows')}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="desktop-menu-commands">
                  <button
                    type="button"
                    disabled={!active}
                    onClick={() => {
                      close()
                      if (active) minimize(active.id)
                    }}
                  >
                    <Minus size={16} />
                    {t('最小化', 'Minimize')}
                  </button>
                  <button
                    type="button"
                    disabled={!active}
                    onClick={() => {
                      close()
                      if (active) toggleSize(active)
                    }}
                  >
                    <Square size={16} />
                    {active?.maximized ? t('还原大小', 'Restore Size') : t('最大化', 'Maximize')}
                  </button>
                  <button
                    type="button"
                    disabled={!canTile}
                    onClick={() => {
                      close()
                      tile()
                    }}
                  >
                    <Columns2 size={16} />
                    {t('平铺窗口', 'Tile Windows')}
                  </button>
                  <button type="button" disabled={!list.length} onClick={toggleDesktop}>
                    <Monitor size={16} />
                    {showDesktopLabel}
                  </button>
                </div>
                {switcher(list)}
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export function DesktopShell({
  manager,
  pinned,
  renderProgram,
  onSponsor,
}: {
  manager: DesktopWindowManager
  pinned: string[]
  renderProgram: (program: DesktopProgram, item: DesktopWindow) => ReactNode
  onSponsor: () => void
}) {
  const { t } = useLocale()
  return (
    <main className="desktop-shell" hidden={!manager.enabled} aria-label={t('桌面', 'Desktop')}>
      <div className="desktop-wallpaper" aria-hidden="true" />
      <DesktopWindows
        manager={manager}
        renderProgram={renderProgram}
        renderChrome={(actions) => <DesktopChrome {...{ manager, actions, pinned, onSponsor }} />}
      />
    </main>
  )
}
