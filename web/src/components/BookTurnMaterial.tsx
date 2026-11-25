import { createPortal } from 'react-dom'

export interface BookTurnBounds {
  top: number
  left: number
  width: number
  height: number
}

// Only the contact shadow is synthetic; the leaf's front and back use real snapshots.
export function BookTurnMaterial({ bounds }: { bounds: BookTurnBounds }) {
  return createPortal(
    <div className="book-turn-material" style={bounds} aria-hidden="true">
      <div className="book-turn-shadow" />
    </div>,
    document.body,
  )
}
