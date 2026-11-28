import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { Grip, Minus, PanelsTopLeft, Square, X } from 'lucide-react'
import { isDesktopStyle, useAppearance } from '../lib/appearance'
import { useLocale } from '../lib/i18n'
import { useWindowMotion, type WindowBounds } from '../lib/use-window-motion'
import { toolRegistry, ToolWorkspace } from '../tools'
import {
  desktopAppKey,
  desktopAppTitle,
  DesktopAppIcon,
  programApp,
  type DesktopApp,
  type DesktopProgram,
} from './DesktopApp'
import { PageBoundary } from './PageBoundary'

type Size = { width: number; height: number }
type Bounds = WindowBounds
export type DesktopWindow = {
  id: number
  app: DesktopApp
  bounds?: Bounds
  search?: string
  minimized: boolean
  maximized: boolean
  closing?: boolean
  layout?: number
}

const edge = 8
const minimumSize = (app: DesktopApp): Size =>
  app.kind === 'program' && app.program === 'ai'
    ? { width: 560, height: 480 }
    : { width: 290, height: 168 }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

function fitBounds(rect: Bounds, area: Size, minimum: Size): Bounds {
  const width = clamp(rect.width, Math.min(minimum.width, area.width), area.width)
  const height = clamp(rect.height, Math.min(minimum.height, area.height), area.height)
  return {
    width,
    height,
    left: clamp(rect.left, 0, area.width - width),
    top: clamp(rect.top, 0, area.height - height),
  }
}

function initialBounds(item: DesktopWindow, area: Size): Bounds {
  const large =
    item.app.kind === 'program' && ['catalog', 'settings', 'ai'].includes(item.app.program)
  const width = Math.round(clamp(area.width * (large ? 0.77 : 0.64), 460, large ? 1000 : 730))
  const height = Math.round(clamp(area.height * 0.85, 350, large ? 800 : 650))
  const id = item.id
  const offset = ((id - 1) % 6) * 22
  return fitBounds(
    {
      width,
      height,
      left: Math.max(0, (area.width - width) * 0.25) + offset,
      top: Math.max(0, (area.height - height) * 0.25) + offset,
    },
    area,
    minimumSize(item.app),
  )
}

export function useDesktopWindows() {
  const { style, desktopSelected, reducedMotion } = useAppearance()
  const enabled = isDesktopStyle(style)
  const motion = enabled && !reducedMotion
  const [frames, setWindows] = useState<DesktopWindow[]>([])
  const sequence = useRef(0)
  const closeHandlers = useRef(new Map<number, () => void>())
  const onClose = useCallback((id: number, run: () => void) => {
    closeHandlers.current.set(id, run)
    return () => {
      closeHandlers.current.delete(id)
    }
  }, [])
  const launch = useCallback(
    (app: DesktopApp, reuse: boolean, search?: string) => {
      if (!enabled) return
      const id = ++sequence.current
      setWindows((items) => {
        const existing =
          reuse &&
          items.find((item) => !item.closing && desktopAppKey(item.app) === desktopAppKey(app))
        return existing
          ? [
              ...items.filter((item) => item !== existing),
              {
                ...existing,
                minimized: false,
                search: search ?? existing.search,
              },
            ]
          : [...items, { id, app, search, minimized: false, maximized: false }]
      })
    },
    [enabled],
  )
  const open = useCallback(
    (toolId: string, reuse = false) => {
      const tool = toolRegistry.get(toolId)
      if (tool) launch({ kind: 'tool', tool }, reuse)
    },
    [launch],
  )
  const openProgram = useCallback(
    (program: DesktopProgram, search?: string) => launch(programApp(program), true, search),
    [launch],
  )
  const update = (id: number, patch: Partial<DesktopWindow>) =>
    setWindows((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  const raise = (id: number) =>
    setWindows((items) => {
      const item = items.find((candidate) => candidate.id === id)
      if (!item || item.closing || (items.at(-1) === item && !item.minimized)) return items
      return [...items.filter((candidate) => candidate !== item), { ...item, minimized: false }]
    })
  const showDesktop = useCallback(
    () =>
      setWindows((items) =>
        items.some((item) => !item.minimized && !item.closing)
          ? items.map((item) =>
              item.closing || item.minimized ? item : { ...item, minimized: true },
            )
          : items,
      ),
    [],
  )
  useLayoutEffect(() => {
    if (!desktopSelected) setWindows((items) => (items.length ? [] : items))
  }, [desktopSelected])

  const dispose = useCallback((id: number) => {
    setWindows((items) => items.filter((item) => item.id !== id))
  }, [])

  return {
    enabled,
    desktopSelected,
    motion,
    frames,
    windows: frames.filter((item) => !item.closing),
    update,
    raise,
    showDesktop,
    open,
    openProgram,
    onClose,
    dispose,
    close: (id: number) => {
      const item = frames.find((candidate) => candidate.id === id)
      if (!item || item.closing) return
      closeHandlers.current.get(id)?.()
      if (motion && !item.minimized) update(id, { closing: true })
      else dispose(id)
    },
    arrange: (bounds: Map<number, Bounds>) =>
      setWindows((items) =>
        items.map((item) => {
          const rect = bounds.get(item.id)
          return rect && !item.closing
            ? {
                ...item,
                bounds: rect,
                maximized: false,
                minimized: false,
                layout: (item.layout ?? 0) + 1,
              }
            : item
        }),
      ),
  }
}

export type DesktopWindowManager = ReturnType<typeof useDesktopWindows>
export type DesktopWindowActions = {
  active: DesktopWindow | undefined
  canTile: boolean
  tile: () => void
}

function DesktopWindowFrame({
  item,
  manager,
  active,
  order,
  area,
  renderProgram,
}: {
  item: DesktopWindow
  manager: DesktopWindowManager
  active: boolean
  order: number
  area: Size
  renderProgram: (program: DesktopProgram, item: DesktopWindow) => ReactNode
}) {
  const { t, resolve } = useLocale()
  const { style } = useAppearance()
  const { id, app, maximized, minimized, closing } = item
  const minimum = minimumSize(app)
  const title = resolve(desktopAppTitle(app, style))
  const frame = useRef<HTMLElement>(null)
  const [draft, setDraft] = useState<Bounds>()
  const rect = maximized
    ? { left: 0, top: 0, ...area }
    : fitBounds(draft ?? item.bounds ?? initialBounds(item, area), area, minimum)
  const hidden = useWindowMotion(frame, {
    id,
    appKey: desktopAppKey(app),
    bounds: rect,
    phase: closing ? 'closing' : minimized ? 'minimized' : 'visible',
    maximized,
    layout: item.layout ?? 0,
    enabled: manager.motion,
    duration: style === 'macos' ? 225 : 180,
    dispose: manager.dispose,
  })
  const position = (dx: number, dy: number, resizing: boolean, from = rect): Bounds => {
    if (!resizing)
      return fitBounds({ ...from, left: from.left + dx, top: from.top + dy }, area, minimum)
    const availWidth = Math.max(0, area.width - from.left)
    const availHeight = Math.max(0, area.height - from.top)
    return {
      ...from,
      width: clamp(from.width + dx, Math.min(minimum.width, availWidth), availWidth),
      height: clamp(from.height + dy, Math.min(minimum.height, availHeight), availHeight),
    }
  }
  const gesture = useRef<{ id: number; x: number; y: number; rect: Bounds; draft?: Bounds } | null>(
    null,
  )
  const start = (event: PointerEvent<HTMLElement>) => {
    if (maximized || !event.isPrimary || event.button !== 0) return
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, rect }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const drag = (event: PointerEvent<HTMLElement>, resizing: boolean) => {
    const initial = gesture.current
    if (initial?.id !== event.pointerId) return
    initial.draft = position(
      event.clientX - initial.x,
      event.clientY - initial.y,
      resizing,
      initial.rect,
    )
    setDraft(initial.draft)
  }
  const stop = (event: PointerEvent<HTMLElement>) => {
    const initial = gesture.current
    if (initial?.id !== event.pointerId) return
    gesture.current = null
    if (initial.draft) {
      manager.update(id, { bounds: initial.draft })
      setDraft(undefined)
    }
  }
  const nudge = (event: KeyboardEvent<HTMLElement>, resizing: boolean) => {
    if (maximized || event.target !== event.currentTarget) return
    const step = event.shiftKey ? 32 : 8
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    if (!dx && !dy) return
    event.preventDefault()
    manager.update(id, { bounds: position(dx, dy, resizing) })
  }
  const maximize = () => manager.update(id, { maximized: !maximized })
  const minimizeLabel = t('最小化', 'Minimize')
  const maximizeLabel = maximized ? t('还原大小', 'Restore size') : t('最大化', 'Maximize')
  const closeLabel = t('关闭窗口', 'Close window')
  const resizeLabel = t('调整窗口大小', 'Resize window')
  const controls = {
    minimize: {
      label: minimizeLabel,
      icon: <Minus size={13} />,
      run: () => manager.update(id, { minimized: true }),
    },
    maximize: {
      label: maximizeLabel,
      icon: maximized ? <PanelsTopLeft size={13} /> : <Square size={11} />,
      run: maximize,
    },
    close: { label: closeLabel, icon: <X size={14} />, run: () => manager.close(id) },
  }
  const actions =
    style === 'macos'
      ? (['close', 'minimize', 'maximize'] as const)
      : (['minimize', 'maximize', 'close'] as const)
  return (
    <section
      ref={frame}
      className="desktop-window"
      id={`tool-window-${id}`}
      aria-labelledby={`tool-window-title-${id}`}
      tabIndex={-1}
      data-active={active}
      data-maximized={maximized}
      data-program={app.kind === 'program' ? app.program : undefined}
      data-desktop-window={id}
      hidden={hidden}
      inert={minimized || closing}
      style={{ ...rect, left: rect.left + edge, top: rect.top + edge, zIndex: order }}
      onPointerDownCapture={() => manager.raise(id)}
      onFocusCapture={() => manager.raise(id)}
      onKeyDown={(event) => nudge(event, false)}
    >
      <header className="desktop-window-bar">
        <div
          className="desktop-window-drag"
          onDoubleClick={maximize}
          onPointerDown={start}
          onPointerMove={(event) => drag(event, false)}
          onLostPointerCapture={stop}
        >
          <DesktopAppIcon app={app} size={16} />
          <span id={`tool-window-title-${id}`}>{title}</span>
        </div>
        <div className="desktop-window-controls">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              data-action={action}
              title={controls[action].label}
              aria-label={controls[action].label}
              onClick={controls[action].run}
            >
              {controls[action].icon}
            </button>
          ))}
        </div>
      </header>
      <div
        className={`desktop-window-body ${app.kind === 'program' ? `desktop-program desktop-program-${app.program}` : ''}`}
      >
        <PageBoundary>
          {app.kind === 'tool' ? (
            <ToolWorkspace tool={app.tool} compact />
          ) : (
            renderProgram(app.program, item)
          )}
        </PageBoundary>
      </div>
      {!maximized && (
        <button
          type="button"
          className="desktop-resize"
          title={resizeLabel}
          aria-label={resizeLabel}
          onPointerDown={start}
          onPointerMove={(event) => drag(event, true)}
          onLostPointerCapture={stop}
          onKeyDown={(event) => nudge(event, true)}
        >
          <Grip size={12} />
        </button>
      )}
    </section>
  )
}

export function DesktopWindows({
  manager,
  renderProgram,
  renderChrome,
}: {
  manager: DesktopWindowManager
  renderProgram: (program: DesktopProgram, item: DesktopWindow) => ReactNode
  renderChrome: (actions: DesktopWindowActions) => ReactNode
}) {
  const layer = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const area = {
    width: Math.max(0, size.width - 2 * edge),
    height: Math.max(0, size.height - 2 * edge),
  }
  const ordered = manager.frames
    .map((item, order) => ({ item, order }))
    .sort((a, b) => a.item.id - b.item.id)
  const active = manager.enabled
    ? manager.windows.filter((item) => !item.minimized).at(-1)
    : undefined
  const activeId = active?.id
  const priorActive = useRef<number | undefined>(undefined)
  useLayoutEffect(() => {
    const element = layer.current
    if (!element || !manager.enabled) return
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [manager.enabled])
  useLayoutEffect(() => {
    const previous = priorActive.current
    priorActive.current = activeId
    if (!manager.enabled) return
    if (activeId !== undefined) {
      const front = document.getElementById(`tool-window-${activeId}`)
      if (!front?.contains(document.activeElement)) front?.focus({ preventScroll: true })
    } else if (
      previous !== undefined &&
      (document.activeElement === document.body || document.activeElement?.closest('[inert]'))
    ) {
      document
        .querySelector<HTMLButtonElement>('[data-desktop-launch]')
        ?.focus({ preventScroll: true })
    }
  }, [activeId, manager.enabled])
  const gap = 8
  const tileable = ordered.filter(({ item }) => !item.closing)
  const sizes = tileable.map(({ item }) => minimumSize(item.app))
  const minWidth = Math.max(1, ...sizes.map(({ width }) => width))
  const minHeight = Math.max(1, ...sizes.map(({ height }) => height))
  const columns = Math.min(tileable.length, Math.floor((area.width + gap) / (minWidth + gap)))
  const rows = Math.ceil(tileable.length / Math.max(1, columns))
  const canTile =
    tileable.length > 1 && columns > 0 && rows * (minHeight + gap) - gap <= area.height
  const tile = () => {
    if (!canTile) return
    const width = Math.floor((area.width - (columns - 1) * gap) / columns)
    const height = Math.floor((area.height - (rows - 1) * gap) / rows)
    manager.arrange(
      new Map(
        tileable.map(({ item }, index) => [
          item.id,
          {
            width,
            height,
            left: (index % columns) * (width + gap),
            top: Math.floor(index / columns) * (height + gap),
          },
        ]),
      ),
    )
  }
  if (!manager.desktopSelected) return null
  return (
    <>
      <div
        ref={layer}
        className="desktop-window-layer"
        data-native-scroll
        hidden={!manager.enabled}
      >
        {ordered.map(({ item, order }) => (
          <DesktopWindowFrame
            key={item.id}
            {...{ item, order, area, manager, renderProgram }}
            active={activeId === item.id}
          />
        ))}
      </div>
      {manager.enabled && renderChrome({ active, canTile, tile })}
    </>
  )
}
