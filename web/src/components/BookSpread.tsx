import type { ReactNode } from 'react'

// Ordinary themes flatten these wrappers; the handbook uses two physical leaves.
export function BookSpread({ left, right, className = '' }: { left: ReactNode; right: ReactNode; className?: string }) {
  return (
    <div className={`book-spread ${className}`}>
      <div className="book-leaf book-left">{left}</div>
      <div className="book-leaf book-right">{right}</div>
    </div>
  )
}
