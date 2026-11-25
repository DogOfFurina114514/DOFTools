import type { CSSProperties, ReactNode } from 'react'
import { useLocale } from '../lib/i18n'
import { toolRegistry } from '../tools'

export const BOOKMARK_TINTS = ['#b79a69', '#779980', '#718ba8', '#a083b1', '#ba8589', '#9b9c73']

export type HandbookBookmark = {
  path: string
  title: string
  icon: ReactNode
  tint: string
}

// Keep the binding mounted when routes or themes change. Only the inner leaf turns.
export function RouteBook({
  pathname,
  children,
  navigation,
  bookmarks,
  bookmarksOpen = false,
  onCloseBookmarks,
}: {
  pathname: string
  children: ReactNode
  navigation?: ReactNode
  bookmarks?: HandbookBookmark[]
  bookmarksOpen?: boolean
  onCloseBookmarks?: () => void
}) {
  const { t, resolve } = useLocale()
  const tools = toolRegistry.list()
  const currentBookmark = bookmarks?.find((bookmark) => bookmark.path === pathname)
  const tool = pathname.startsWith('/tool/') ? toolRegistry.get(pathname.slice(6)) : undefined
  const chapter = tool
    ? resolve(tool.title)
    : pathname === '/'
      ? t('手册目录', 'Contents')
      : pathname === '/tools'
        ? t('所有工具', 'All tools')
        : pathname === '/ai'
          ? t('AI 助手', 'AI assistant')
          : pathname === '/settings'
            ? t('设置与外观', 'Settings & appearance')
            : t('附录', 'Appendix')
  const folio = tool
    ? tools.findIndex((entry) => entry.id === tool.id) + 3
    : pathname === '/'
      ? 1
      : pathname === '/tools'
        ? 2
        : pathname === '/ai'
          ? tools.length + 3
          : pathname === '/settings'
            ? tools.length + 4
            : tools.length + 5

  return (
    <div className="route-book" data-bookmarks-open={bookmarksOpen ? 'true' : undefined}>
      {navigation}
      {currentBookmark && (
        <div
          className="book-current-bookmark"
          style={{ '--bookmark-tint': currentBookmark.tint } as CSSProperties}
          aria-hidden="true"
        >
          {currentBookmark.icon}
          <span>{currentBookmark.title}</span>
        </div>
      )}
      {bookmarksOpen && (
        <button
          type="button"
          className="book-navigation-dismiss"
          onClick={onCloseBookmarks}
          aria-label={t('收起书签', 'Close bookmarks')}
        />
      )}
      <div className="book-binding" aria-hidden="true" />
      {children}
      <div className="book-chapter-reference" aria-hidden="true">
        <span className="book-folio-left">
          {String(folio * 2 - 1).padStart(2, '0')} · {t('冒险手册', 'Adventurer’s Handbook')}
        </span>
        <span className="book-folio-right">
          {chapter} · {String(folio * 2).padStart(2, '0')}
        </span>
        <span className="book-folio-single">
          {chapter} · {String(folio).padStart(2, '0')}
        </span>
      </div>
    </div>
  )
}
