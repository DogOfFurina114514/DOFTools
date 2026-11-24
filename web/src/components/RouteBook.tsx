import type { ReactNode } from 'react'
import { useLocale } from '../lib/i18n'
import { toolRegistry } from '../tools'

// Keep the binding mounted when routes or themes change. Only the inner leaf turns.
export function RouteBook({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { t, resolve } = useLocale()
  const tools = toolRegistry.list()
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
    <div className="route-book">
      <div className="book-verso" aria-hidden="true">
        <span className="book-seal">✦</span>
        <span className="book-spine-title">{t('冒险手册', 'ADVENTURER’S HANDBOOK')}</span>
        <span className="book-seal">✧</span>
      </div>
      <div className="book-binding" aria-hidden="true" />
      {children}
      <div className="book-chapter-reference" aria-hidden="true">
        <span>{chapter}</span>
        <span>{String(folio).padStart(2, '0')}</span>
      </div>
    </div>
  )
}
