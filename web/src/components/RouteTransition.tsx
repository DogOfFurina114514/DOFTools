import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, type Location } from 'react-router-dom'
import { useAppearance } from '../lib/appearance'
import { workspacePages } from '../lib/workspace-loader'
import { BookTurnMaterial, type BookTurnBounds } from './BookTurnMaterial'
import { RouteBook } from './RouteBook'
import { TerminalScanMaterial } from './TerminalScanMaterial'

async function preparePage(pathname: string) {
  if (pathname === '/') await workspacePages.dashboard()
  else if (pathname === '/settings') await workspacePages.settings()
  else if (pathname === '/ai') await workspacePages.ai()
}

export function RouteTransition({
  children,
  onReady,
}: {
  children: (location: Location) => ReactNode
  onReady?: (pathname: string) => void
}) {
  const location = useLocation()
  const { style, pageMotion, reducedMotion } = useAppearance()
  const [displayedLocation, setDisplayedLocation] = useState(location)
  const [bookBounds, setBookBounds] = useState<BookTurnBounds | null>(null)
  const [scan, setScan] = useState<{ bounds: BookTurnBounds; snapshot: boolean } | null>(null)
  const displayed = useRef(location)
  const page = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const historyIndex = useRef<number>(window.history.state?.idx ?? 0)
  const readyHandler = useRef(onReady)
  readyHandler.current = onReady

  useEffect(() => {
    readyHandler.current?.(displayedLocation.pathname)
  }, [displayedLocation.pathname])

  useLayoutEffect(() => {
    const sequence = ++generation.current
    const root = document.documentElement
    const element = page.current!
    const nextIndex: number = window.history.state?.idx ?? historyIndex.current
    const backward = nextIndex < historyIndex.current
    historyIndex.current = nextIndex
    let transition: ViewTransition | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const clear = () => {
      delete root.dataset.routeTransition
      delete root.dataset.routeDirection
      element.style.removeProperty('view-transition-name')
      delete element.dataset.pageEnter
      delete element.dataset.pageDirection
      setBookBounds(null)
      setScan(null)
    }
    const commit = () => {
      if (generation.current !== sequence) return
      displayed.current = location
      setDisplayedLocation(location)
    }
    const cleanup = () => {
      generation.current++
      transition?.skipTransition()
      if (timer) clearTimeout(timer)
      clear()
    }
    // Query filters, input edits, language and theme changes keep the current page.
    if (displayed.current.pathname === location.pathname) {
      commit()
      return cleanup
    }
    if (!pageMotion || reducedMotion) {
      commit()
      return cleanup
    }
    void (async () => {
      // Load lazy pages before taking snapshots so a loading placeholder never flips.
      await preparePage(location.pathname).catch(() => {})
      if (generation.current !== sequence) return
      const visibleBounds = () => {
        const rect = element.getBoundingClientRect()
        const topbar = document.querySelector('.topbar')?.getBoundingClientRect()
        const top = Math.max(0, rect.top, topbar?.bottom ?? 0)
        const left = Math.max(0, rect.left)
        const height = Math.max(0, Math.min(innerHeight, rect.bottom) - top)
        const width = Math.max(0, Math.min(innerWidth, rect.right) - left)
        return height && width ? { top, left, width, height } : null
      }
      if (typeof document.startViewTransition === 'function') {
        root.dataset.routeTransition = style
        root.dataset.routeDirection = backward ? 'back' : 'forward'
        element.style.viewTransitionName = 'tool-page'
        if (style === 'genshin') {
          const bounds = visibleBounds()
          if (bounds) flushSync(() => setBookBounds(bounds))
        } else if (style === 'endfield') {
          const bounds = visibleBounds()
          if (bounds) flushSync(() => setScan({ bounds, snapshot: true }))
        }
        try {
          transition = document.startViewTransition(() => {
            if (generation.current === sequence) flushSync(commit)
          })
          void transition.ready.catch(() => {})
          await transition.finished.catch(() => {})
          if (generation.current === sequence) clear()
          return
        } catch {
          clear()
        }
      }
      if (generation.current !== sequence) return
      flushSync(commit)
      element.dataset.pageDirection = backward ? 'back' : 'forward'
      element.dataset.pageEnter = style
      if (style === 'endfield') {
        const bounds = visibleBounds()
        if (bounds) setScan({ bounds, snapshot: false })
      }
      timer = setTimeout(clear, 1000)
    })()
    return cleanup
  }, [location, style, pageMotion, reducedMotion])

  return (
    <>
      <RouteBook pathname={displayedLocation.pathname}>
        <div className="route-page" ref={page}>
          {children(displayedLocation)}
        </div>
      </RouteBook>
      {bookBounds && <BookTurnMaterial bounds={bookBounds} />}
      {scan && <TerminalScanMaterial {...scan} />}
    </>
  )
}
