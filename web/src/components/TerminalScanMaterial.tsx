import { createPortal } from 'react-dom'
import type { BookTurnBounds } from './BookTurnMaterial'

export function TerminalScanMaterial({
  bounds,
  snapshot,
}: {
  bounds: BookTurnBounds
  snapshot: boolean
}) {
  return createPortal(
    <div
      className="terminal-scan-material"
      data-snapshot={String(snapshot)}
      aria-hidden="true"
      style={{ top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height }}
    >
      <div
        className="terminal-scan-grid"
        style={{ viewTransitionName: snapshot ? 'terminal-grid' : undefined }}
      />
      <div
        className="terminal-scan-beam"
        style={{ viewTransitionName: snapshot ? 'terminal-beam' : undefined }}
      />
    </div>,
    document.body,
  )
}
