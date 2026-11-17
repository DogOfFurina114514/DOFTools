import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from '../lib/i18n'

type Rail = {
  key: string
  target: HTMLElement
  axis: 'y' | 'x'
  window: boolean
  left: number
  top: number
  length: number
  thumb: number
  position: number
  max: number
  value: number
}
const selectors =
  '[data-scroll-area], .sidebar, .ai-transcript, .setup-dialog, .modal-backdrop, .search-results, .help-dialog, .markdown-table, pre, textarea, .tool-result'
const ids = new WeakMap<HTMLElement, string>()
let sequence = 0
const identity = (element: HTMLElement) => {
  if (!ids.has(element)) ids.set(element, `scroll-area-${++sequence}`)
  return ids.get(element)!
}
const parentOf = (element: HTMLElement): HTMLElement | null => {
  if (element.parentElement) return element.parentElement
  const root = element.getRootNode()
  return root instanceof ShadowRoot ? (root.host as HTMLElement) : null
}

/** Overlay rails preserve native scrolling, while supplying themeable pointer and keyboard controls. */
export function ThemeScrollbars() {
  const { t } = useLocale()
  const [rails, setRails] = useState<Rail[]>([])
  useEffect(() => {
    let frame = 0
    let targets: HTMLElement[] = []
    let discover = true
    const observer = new ResizeObserver(() => schedule())
    const update = () => {
      frame = 0
      if (discover) {
        discover = false
        observer.disconnect()
        targets.forEach((element) => element.removeEventListener('scroll', schedule))
        targets = [...document.querySelectorAll<HTMLElement>(selectors)]
        // Material's editable control lives inside its shadow tree.
        for (const host of document.querySelectorAll(
          'md-outlined-text-field, md-filled-text-field',
        )) {
          const root = host.shadowRoot
          if (!root) continue
          if (!root.querySelector('[data-themed-scroll]')) {
            const style = document.createElement('style')
            style.dataset.themedScroll = ''
            style.textContent =
              '* { scrollbar-width: none; -webkit-tap-highlight-color: transparent; } *::-webkit-scrollbar { display: none; }'
            root.append(style)
          }
          targets.push(...root.querySelectorAll<HTMLTextAreaElement>('textarea'))
        }
        targets.forEach((element) => {
          observer.observe(element)
          element.addEventListener('scroll', schedule)
        })
        observer.observe(document.body)
      }
      const next: Rail[] = []
      const root = document.scrollingElement as HTMLElement
      for (const element of [root, ...targets]) {
        const isWindow = element === root
        if (!element.isConnected || element.closest('[inert]')) continue
        if ((element.getRootNode() as ShadowRoot).host?.closest('[inert]')) continue
        const css = getComputedStyle(element)
        if (css.visibility === 'hidden' || css.display === 'none') continue
        if (isWindow && getComputedStyle(document.body).overflow === 'hidden') continue
        const rect = isWindow
          ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
          : element.getBoundingClientRect()
        let left = Math.max(0, rect.left),
          top = Math.max(0, rect.top)
        let right = Math.min(innerWidth, rect.right),
          bottom = Math.min(innerHeight, rect.bottom)
        for (let parent = parentOf(element); !isWindow && parent; parent = parentOf(parent)) {
          const overflow = getComputedStyle(parent)
          const clip = parent.getBoundingClientRect()
          if (/(auto|scroll|hidden|clip)/.test(overflow.overflowY)) {
            top = Math.max(top, clip.top)
            bottom = Math.min(bottom, clip.bottom)
          }
          if (/(auto|scroll|hidden|clip)/.test(overflow.overflowX)) {
            left = Math.max(left, clip.left)
            right = Math.min(right, clip.right)
          }
        }
        if (right - left < 20 || bottom - top < 20) continue
        for (const axis of ['y', 'x'] as const) {
          if (!isWindow && !/(auto|scroll)/.test(axis === 'y' ? css.overflowY : css.overflowX))
            continue
          const view = isWindow
            ? axis === 'y'
              ? innerHeight
              : innerWidth
            : axis === 'y'
              ? element.clientHeight
              : element.clientWidth
          const total = axis === 'y' ? element.scrollHeight : element.scrollWidth
          const max = total - view
          if (max < 2) continue
          if (!element.id) element.id = identity(element)
          const length = (axis === 'y' ? bottom - top : right - left) - 12
          const thumb = Math.min(length, Math.max(28, (length * view) / total))
          const value = axis === 'y' ? element.scrollTop : element.scrollLeft
          next.push({
            key: `${identity(element)}-${axis}`,
            target: element,
            axis,
            window: isWindow,
            left: axis === 'y' ? right - 12 : left + 6,
            top: axis === 'y' ? top + 6 : bottom - 12,
            length,
            thumb,
            max,
            value,
            position: (length - thumb) * Math.min(1, Math.max(0, value / max)),
          })
        }
      }
      setRails(next)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const mutations = new MutationObserver((records) => {
      if (records.every((record) => (record.target as Element).closest?.('.theme-scrollbars')))
        return
      if (
        records.some(
          (record) =>
            record.type === 'childList' &&
            [...record.addedNodes, ...record.removedNodes].some((node) => node.nodeType === 1),
        )
      )
        discover = true
      schedule()
    })
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'inert'],
    })
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    document.addEventListener('input', schedule, true)
    const timer = setTimeout(() => {
      discover = true
      schedule()
    }, 800)
    schedule()
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      observer.disconnect()
      targets.forEach((element) => element.removeEventListener('scroll', schedule))
      mutations.disconnect()
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('input', schedule, true)
    }
  }, [])
  const scroll = (rail: Rail, value: number) => {
    const options = {
      [rail.axis === 'y' ? 'top' : 'left']: Math.min(rail.max, Math.max(0, value)),
      behavior: 'instant' as const,
    }
    if (rail.window) window.scrollTo(options)
    else rail.target.scrollTo(options)
  }
  return createPortal(
    <div className="theme-scrollbars">
      {rails.map((rail) => (
        <div
          key={rail.key}
          className={`themed-scrollbar axis-${rail.axis}`}
          data-scroll-kind={rail.window ? 'page' : 'area'}
          style={{
            left: rail.left,
            top: rail.top,
            [rail.axis === 'y' ? 'height' : 'width']: rail.length,
          }}
          role="scrollbar"
          tabIndex={0}
          aria-label={rail.window ? t('页面滚动', 'Page scroll') : t('区域滚动', 'Scroll area')}
          aria-orientation={rail.axis === 'y' ? 'vertical' : 'horizontal'}
          aria-valuemin={0}
          aria-valuemax={Math.round(rail.max)}
          aria-valuenow={Math.round(rail.value)}
          aria-controls={rail.target.id}
          onKeyDown={(event) => {
            const amount =
              event.key === 'Home'
                ? -rail.max
                : event.key === 'End'
                  ? rail.max
                  : /^(ArrowDown|ArrowRight)$/.test(event.key)
                    ? 40
                    : /^(ArrowUp|ArrowLeft)$/.test(event.key)
                      ? -40
                      : event.key === 'PageDown'
                        ? rail.length
                        : event.key === 'PageUp'
                          ? -rail.length
                          : 0
            if (amount) {
              event.preventDefault()
              scroll(rail, rail.value + amount)
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            const track = event.currentTarget
            const rect = track.getBoundingClientRect()
            const coordinate = (pointer: { clientX: number; clientY: number }) =>
              rail.axis === 'y' ? pointer.clientY : pointer.clientX
            const local = coordinate(event) - (rail.axis === 'y' ? rect.top : rect.left)
            const grabbed = (event.target as HTMLElement).classList.contains('themed-scroll-thumb')
              ? local - rail.position
              : rail.thumb / 2
            const move = (pointer: PointerEvent | typeof event) =>
              scroll(
                rail,
                ((coordinate(pointer) - (rail.axis === 'y' ? rect.top : rect.left) - grabbed) /
                  Math.max(1, rail.length - rail.thumb)) *
                  rail.max,
              )
            const end = () => {
              track.classList.remove('is-dragging')
              track.removeEventListener('pointermove', move)
              track.removeEventListener('lostpointercapture', end)
            }
            track.setPointerCapture(event.pointerId)
            track.classList.add('is-dragging')
            track.addEventListener('pointermove', move)
            track.addEventListener('lostpointercapture', end)
            move(event)
          }}
        >
          <span
            className="themed-scroll-thumb"
            style={{
              [rail.axis === 'y' ? 'height' : 'width']: rail.thumb,
              transform: `translate${rail.axis.toUpperCase()}(${rail.position}px)`,
            }}
          />
        </div>
      ))}
    </div>,
    document.body,
  )
}
