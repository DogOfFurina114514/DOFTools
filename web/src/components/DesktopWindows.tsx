import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { AppWindow, Grid2X2, Grip, Minus, PanelsTopLeft, Square, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { isDesktopStyle, useAppearance } from '../lib/appearance'
import { useLocale } from '../lib/i18n'
import { toolRegistry, ToolWorkspace, type ToolDefinition } from '../tools'
import { PageBoundary } from './PageBoundary'
import { ToolIcon } from './ToolIcon'

type Size = { width: number; height: number }
type Bounds = Size & { left: number; top: number }
type ToolWindow = {
  id: number
  tool: ToolDefinition
  bounds?: Bounds
  minimized: boolean
  maximized: boolean
}

const edge = 8
const minWidth = 290
const minHeight = 168
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

function fitBounds(rect: Bounds, area: Size): Bounds {
  const width = clamp(rect.width, Math.min(minWidth, area.width), area.width)
  const height = clamp(rect.height, Math.min(minHeight, area.height), area.height)
  return {
    width,
    height,
    left: clamp(rect.left, 0, area.width - width),
    top: clamp(rect.top, 0, area.height - height),
  }
}

function initialBounds(id: number, area: Size): Bounds {
  const width = Math.round(clamp(area.width * 0.68, 460, 730))
  const height = Math.round(clamp(area.height * 0.84, 350, 650))
  const offset = ((id - 1) % 6) * 22
  return fitBounds(
    {
      width,
      height,
      left: Math.max(0, (area.width - width) * 0.25) + offset,
      top: Math.max(0, (area.height - height) * 0.25) + offset,
    },
    area,
  )
}

export function useDesktopWindows() {
  const { style, desktopSelected } = useAppearance()
  const enabled = isDesktopStyle(style)
  const { pathname } = useLocation()
  const [windows, setWindows] = useState<ToolWindow[]>([])
  const sequence = useRef(0)
  const open = useCallback(
    (toolId: string) => {
      const tool = toolRegistry.get(toolId)
      if (!tool || !enabled) return
      const id = ++sequence.current
      setWindows((items) => [...items, { id, tool, minimized: false, maximized: false }])
    },
    [enabled],
  )
  const update = (id: number, patch: Partial<ToolWindow>) =>
    setWindows((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  const raise = (id: number) =>
    setWindows((items) => {
      const item = items.find((candidate) => candidate.id === id)
      if (!item || (items.at(-1) === item && !item.minimized)) return items
      return [...items.filter((candidate) => candidate !== item), { ...item, minimized: false }]
    })
  const showDesktop = useCallback(
    () =>
      setWindows((items) =>
        items.some((item) => !item.minimized)
          ? items.map((item) => ({ ...item, minimized: true }))
          : items,
      ),
    [],
  )
  useLayoutEffect(() => {
    showDesktop()
  }, [pathname, showDesktop])
  useLayoutEffect(() => {
    if (!desktopSelected) setWindows((items) => (items.length ? [] : items))
  }, [desktopSelected])

  return {
    enabled,
    desktopSelected,
    windows,
    update,
    raise,
    showDesktop,
    open,
    close: (id: number) => setWindows((items) => items.filter((item) => item.id !== id)),
    arrange: (bounds: Map<number, Bounds>) =>
      setWindows((items) =>
        items.map((item) => {
          const rect = bounds.get(item.id)
          return rect ? { ...item, bounds: rect, maximized: false, minimized: false } : item
        }),
      ),
  }
}

type Manager = ReturnType<typeof useDesktopWindows>

function DesktopToolWindow({
  item,
  manager,
  active,
  order,
  area,
}: {
  item: ToolWindow
  manager: Manager
  active: boolean
  order: number
  area: Size
}) {
  const { t, resolve } = useLocale()
  const { style } = useAppearance()
  const { id, tool, maximized, minimized } = item
  const title = resolve(tool.title)
  const [draft, setDraft] = useState<Bounds>()
  const rect = maximized
    ? { left: 0, top: 0, ...area }
    : fitBounds(draft ?? item.bounds ?? initialBounds(id, area), area)
  const position = (dx: number, dy: number, resizing: boolean, from = rect): Bounds => {
    if (!resizing) return fitBounds({ ...from, left: from.left + dx, top: from.top + dy }, area)
    const availWidth = Math.max(0, area.width - from.left)
    const availHeight = Math.max(0, area.height - from.top)
    return {
      ...from,
      width: clamp(from.width + dx, Math.min(minWidth, availWidth), availWidth),
      height: clamp(from.height + dy, Math.min(minHeight, availHeight), availHeight),
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
      className="desktop-window"
      id={`tool-window-${id}`}
      aria-labelledby={`tool-window-title-${id}`}
      tabIndex={-1}
      data-active={active}
      data-maximized={maximized}
      hidden={minimized}
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
          <ToolIcon tool={tool} size={16} />
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
      <div className="desktop-window-body">
        <PageBoundary>
          <ToolWorkspace tool={tool} compact />
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
  onCatalog,
}: {
  manager: Manager
  onCatalog: () => void
}) {
  const { t, resolve } = useLocale()
  const layer = useRef<HTMLDivElement>(null)
  const catalog = useRef<HTMLButtonElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const area = {
    width: Math.max(0, size.width - 2 * edge),
    height: Math.max(0, size.height - 2 * edge),
  }
  const ordered = manager.windows
    .map((item, order) => ({ item, order }))
    .sort((a, b) => a.item.id - b.item.id)
  const activeId = manager.enabled
    ? manager.windows.filter((item) => !item.minimized).at(-1)?.id
    : undefined
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
    } else if (previous !== undefined && document.activeElement === document.body) {
      catalog.current?.focus({ preventScroll: true })
    }
  }, [activeId, manager.enabled])
  const gap = 8
  const columns = Math.min(ordered.length, Math.floor((area.width + gap) / (minWidth + gap)))
  const rows = Math.ceil(ordered.length / Math.max(1, columns))
  const canTile = ordered.length > 1 && columns > 0 && rows * (minHeight + gap) - gap <= area.height
  const tile = () => {
    if (!canTile) return
    const width = Math.floor((area.width - (columns - 1) * gap) / columns)
    const height = Math.floor((area.height - (rows - 1) * gap) / rows)
    manager.arrange(
      new Map(
        ordered.map(({ item }, index) => [
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
  const catalogLabel = t('所有工具', 'All tools')
  const tileLabel = t('平铺窗口', 'Tile windows')
  return (
    <>
      <div
        ref={layer}
        className="desktop-window-layer"
        data-native-scroll
        hidden={!manager.enabled}
      >
        {ordered.map(({ item, order }) => (
          <DesktopToolWindow
            key={item.id}
            {...{ item, order, area, manager }}
            active={activeId === item.id}
          />
        ))}
      </div>
      <div
        className="desktop-taskbar"
        role="group"
        aria-label={t('窗口任务栏', 'Window taskbar')}
        hidden={!manager.enabled}
      >
        <button
          type="button"
          ref={catalog}
          className="desktop-task-command"
          title={catalogLabel}
          aria-label={catalogLabel}
          onClick={onCatalog}
        >
          <Grid2X2 size={19} />
        </button>
        <div className="desktop-task-list" data-native-scroll>
          {ordered.map(({ item }) => {
            const title = resolve(item.tool.title)
            const active = activeId === item.id
            const label = t('{tool}，窗口 {number}', '{tool}, window {number}', {
              tool: title,
              number: item.id,
            })
            return (
              <button
                type="button"
                className="desktop-task"
                key={item.id}
                title={label}
                aria-label={label}
                aria-pressed={active}
                aria-controls={`tool-window-${item.id}`}
                data-minimized={item.minimized}
                onClick={(event) => {
                  if (active) manager.update(item.id, { minimized: true })
                  else {
                    manager.raise(item.id)
                    document
                      .getElementById(`tool-window-${item.id}`)
                      ?.focus({ preventScroll: true })
                  }
                  event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                }}
              >
                <ToolIcon tool={item.tool} size={18} />
                <span>{title}</span>
              </button>
            )
          })}
        </div>
        {ordered.length > 1 && (
          <button
            type="button"
            className="desktop-task-command"
            title={tileLabel}
            aria-label={tileLabel}
            disabled={!canTile}
            onClick={tile}
          >
            <AppWindow size={19} />
          </button>
        )}
      </div>
    </>
  )
}
