import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'

export type WindowBounds = { left: number; top: number; width: number; height: number }
type Phase = 'visible' | 'minimized' | 'closing'
type Snapshot = { bounds: WindowBounds; phase: Phase; maximized: boolean; layout: number }

const origin = (bounds: WindowBounds, ratio: number, offsetY = 0): WindowBounds => ({
  left: bounds.left + (bounds.width * (1 - ratio)) / 2,
  top: bounds.top + (bounds.height * (1 - ratio)) / 2 + offsetY,
  width: bounds.width * ratio,
  height: bounds.height * ratio,
})

function taskbarBounds(window: HTMLElement, bounds: WindowBounds, appKey: string) {
  const shell = window.closest('.desktop-shell')
  const target =
    shell?.querySelector(`[data-task-app="${CSS.escape(appKey)}"] .desktop-app-glyph`) ??
    shell?.querySelector('.desktop-task-overflow') ??
    shell?.querySelector('[data-desktop-launch]')
  if (!target) return origin(bounds, 0.13, 24)

  const point = target.getBoundingClientRect()
  const frame = window.getBoundingClientRect()
  const ratio = Math.min(0.18, Math.max(0.04, (point.width * 1.5) / bounds.width))
  const small = origin(bounds, ratio)
  return {
    ...small,
    left: bounds.left + point.left + point.width / 2 - frame.left - small.width / 2,
    top: bounds.top + point.top + point.height / 2 - frame.top - small.height / 2,
  }
}

const transform = (bounds: WindowBounds, base: WindowBounds) =>
  `translate(${bounds.left - base.left}px, ${bounds.top - base.top}px) scale(${bounds.width / base.width}, ${bounds.height / base.height})`

function currentFrame(window: HTMLElement, bounds: WindowBounds) {
  const css = getComputedStyle(window)
  const matrix = new DOMMatrixReadOnly(css.transform === 'none' ? undefined : css.transform)
  return {
    bounds: {
      left: bounds.left + matrix.e,
      top: bounds.top + matrix.f,
      width: bounds.width * matrix.a,
      height: bounds.height * matrix.d,
    },
    opacity: Number(css.opacity),
  }
}

export function useWindowMotion(
  frame: RefObject<HTMLElement | null>,
  {
    id,
    appKey,
    bounds: { left, top, width, height },
    phase,
    maximized,
    layout,
    enabled,
    duration,
    dispose,
  }: {
    id: number
    appKey: string
    bounds: WindowBounds
    phase: Phase
    maximized: boolean
    layout: number
    enabled: boolean
    duration: number
    dispose: (id: number) => void
  },
) {
  const previous = useRef<Snapshot>(undefined)
  const animation = useRef<Animation | null>(null)
  const [parked, setParked] = useState(phase === 'minimized')
  const cancel = useCallback(() => {
    const current = animation.current
    animation.current = null
    if (current) {
      current.onfinish = null
      current.cancel()
    }
  }, [])

  useLayoutEffect(
    () => () => {
      cancel()
      previous.current = undefined
    },
    [cancel],
  )
  useLayoutEffect(() => {
    if (parked && phase === 'minimized') cancel()
  }, [cancel, parked, phase])

  useLayoutEffect(() => {
    const window = frame.current
    const bounds = { left, top, width, height }
    const before = previous.current
    const valid = width > 0 && height > 0
    if (valid) previous.current = { bounds, phase, maximized, layout }

    const settle = () => {
      if (phase === 'closing') dispose(id)
      else setParked(phase === 'minimized')
    }
    if (!window || !enabled || !valid || typeof window.animate !== 'function') {
      cancel()
      settle()
      return
    }

    const changed = before?.phase !== phase
    const relayout =
      phase === 'visible' && before && (before.maximized !== maximized || before.layout !== layout)
    if (!changed && !relayout) {
      if (
        animation.current &&
        before &&
        (before.bounds.width !== width ||
          before.bounds.height !== height ||
          before.bounds.left !== left ||
          before.bounds.top !== top)
      ) {
        cancel()
        settle()
      }
      return
    }

    if (!before && phase === 'minimized') {
      settle()
      return
    }

    // Reversing a running transition starts at its current visual position.
    const interrupted = animation.current && before ? currentFrame(window, before.bounds) : null
    cancel()
    const from =
      interrupted?.bounds ??
      (before?.phase === 'minimized'
        ? taskbarBounds(window, bounds, appKey)
        : (before?.bounds ?? origin(bounds, 0.965, 8)))
    const fromOpacity = interrupted?.opacity ?? (!before || before.phase === 'minimized' ? 0 : 1)
    const to =
      phase === 'closing'
        ? origin(bounds, 0.965, 6)
        : phase === 'minimized'
          ? taskbarBounds(window, bounds, appKey)
          : bounds

    if (phase === 'visible') setParked(false)
    const motion = window.animate(
      [
        { transform: transform(from, bounds), opacity: fromOpacity },
        { transform: transform(to, bounds), opacity: phase === 'visible' ? 1 : 0 },
      ],
      {
        duration: phase === 'closing' ? Math.round(duration * 0.75) : duration,
        easing:
          phase === 'visible'
            ? 'cubic-bezier(0.18, 0.75, 0.23, 1)'
            : 'cubic-bezier(0.45, 0, 0.65, 1)',
        fill: 'both',
      },
    )
    animation.current = motion
    motion.onfinish = () => {
      if (animation.current !== motion) return
      settle()
      // Keep the last frame of an exit until React hides or unmounts it.
      if (phase === 'visible') cancel()
    }
  }, [
    appKey,
    cancel,
    dispose,
    duration,
    enabled,
    frame,
    height,
    id,
    layout,
    left,
    maximized,
    phase,
    top,
    width,
  ])

  return phase === 'minimized' && (parked || !enabled)
}
