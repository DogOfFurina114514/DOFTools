import { createPortal } from 'react-dom'

export interface BookTurnBounds {
  top: number
  left: number
  width: number
  height: number
}

// Separate snapshot layers let the fold travel over the page without moving the shell.
export function BookTurnMaterial({ bounds }: { bounds: BookTurnBounds }) {
  return createPortal(
    <div className="book-turn-material" style={bounds} aria-hidden="true">
      <div className="book-turn-shadow" />
      <svg className="book-turn-fold" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="book-turn-paper" x1="0" x2="1">
            <stop offset="0" stopColor="#71634a" stopOpacity="0" />
            <stop offset="0.35" stopColor="#a58c62" stopOpacity="0.7" />
            <stop offset="0.6" stopColor="#e8d9bb" />
            <stop offset="0.85" stopColor="#fff9e9" />
            <stop offset="1" stopColor="#b59b70" />
          </linearGradient>
        </defs>
        <path d="M 90 0 Q 74 50 90 100 L 100 96 Q 87 50 100 4 Z" fill="url(#book-turn-paper)" />
        <path d="M 100 4 Q 87 50 100 96" fill="none" stroke="#fffdf3" strokeWidth="0.32" />
        <path
          d="M 90 0 Q 74 50 90 100"
          fill="none"
          stroke="#59452b"
          strokeOpacity="0.18"
          strokeWidth="0.6"
        />
      </svg>
    </div>,
    document.body,
  )
}
