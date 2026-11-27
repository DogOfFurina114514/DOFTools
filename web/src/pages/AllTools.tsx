import { BookSpread } from '../components/BookSpread'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUpRight, ChevronRight, FolderOpen, Monitor, Search, X } from 'lucide-react'
import { toolTags, isToolTag } from '../data/tags'
import { useLocale } from '../lib/i18n'
import { useAppearance } from '../lib/appearance'
import { toolRegistry } from '../tools/registry'
import { filterTools } from '../lib/tool-filter'
import { ToolLink, useOpenTool } from '../lib/tool-launch'
import { PinToolButton } from '../components/PinToolButton'
import { EmptyPanel } from '../components/UI'
import { ToolIcon } from '../components/ToolIcon'
import {
  DesktopAppGlyph,
  DesktopAppIcon,
  desktopAppDragProps,
  desktopAppKey,
  desktopAppTitle,
  programApp,
  type DesktopApp,
  type DesktopProgram,
} from '../components/DesktopApp'

export function AllTools({
  pinned,
  onTogglePin,
  windowFilters,
  onOpenProgram,
}: {
  pinned: string[]
  onTogglePin: (id: string) => void
  windowFilters?: { search: string; onChange: (value: string) => void }
  onOpenProgram?: (program: DesktopProgram) => void
}) {
  const { t, resolve } = useLocale()
  const { style } = useAppearance()
  const [selectedTool, setSelectedTool] = useState<string>()
  const [routeParams, setRouteParams] = useSearchParams()
  const params = windowFilters ? new URLSearchParams(windowFilters.search) : routeParams
  const setParams = (next: URLSearchParams, options?: { replace: boolean }) => {
    if (windowFilters) windowFilters.onChange(next.toString())
    else setRouteParams(next, options)
  }
  const openTool = useOpenTool()
  const selected = [...new Set(params.getAll('tag').filter(isToolTag))]
  const query = params.get('q') ?? ''
  const tools = toolRegistry.list()
  const results = filterTools(tools, query, selected)
  const explorer = style === 'windows'
  const launchpad = style === 'macos'
  const programResults =
    windowFilters && launchpad && onOpenProgram && !selected.length
      ? (['settings', 'ai', 'overview', 'help'] as const).filter((program) =>
          resolve(desktopAppTitle(programApp(program), style))
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        )
      : []
  const openFirstResult = () => {
    if (results[0]) openTool(results[0].id)
    else if (programResults[0]) onOpenProgram?.(programResults[0])
  }
  const desktopResults: DesktopApp[] = [
    ...programResults.map(programApp),
    ...results.map((tool): DesktopApp => ({ kind: 'tool', tool })),
  ]
  const openApp = (app: DesktopApp) =>
    app.kind === 'tool' ? openTool(app.tool.id) : onOpenProgram?.(app.program)
  return (
    <section className={`tool-catalog${windowFilters ? ' desktop-catalog' : ''}`}>
      <BookSpread
        left={
          <>
            <div className="catalog-header">
              {!windowFilters && (
                <div className="page-heading">
                  <span className="eyebrow">ALL TOOLS</span>
                  <h1>
                    {t('所有工具', 'All tools')}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {t(
                      '搜索处理要求，或选择标签。多选时仅显示同时包含所有选中标签的工具。',
                      'Search for a task or choose tags. Multiple tags show tools that contain every selected tag.',
                    )}
                  </p>
                </div>
              )}
              {windowFilters && explorer && (
                <div className="desktop-folder-path" aria-label={t('当前位置', 'Current folder')}>
                  <Monitor size={16} aria-hidden="true" />
                  {t('此电脑', 'This PC')}
                  <ChevronRight size={13} aria-hidden="true" />
                  <FolderOpen size={16} aria-hidden="true" />
                  {t('所有工具', 'All Tools')}
                </div>
              )}
              <div className="all-tools-search">
                <Search size={20} />
                <input
                  type="search"
                  aria-label={t('搜索关键词', 'Search keywords')}
                  placeholder={t(
                    '搜索工具或要求，如 PNG 转 JPG…',
                    'Search tools or tasks, e.g. PNG to JPG…',
                  )}
                  value={query}
                  onChange={(event) => {
                    const next = new URLSearchParams(params)
                    if (event.target.value) next.set('q', event.target.value)
                    else next.delete('q')
                    setParams(next, { replace: true })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) openFirstResult()
                  }}
                />
                {query && (
                  <button
                    className="icon-button"
                    aria-label={t('清空搜索', 'Clear search')}
                    onClick={() => {
                      const next = new URLSearchParams(params)
                      next.delete('q')
                      setParams(next, { replace: true })
                    }}
                  >
                    <X size={17} />
                  </button>
                )}
                {!windowFilters && <kbd>Ctrl / ⌘ K</kbd>}
              </div>
            </div>
            <div
              className="tool-tag-filters"
              role="group"
              aria-label={t('标签筛选', 'Filter by tags')}
            >
              {toolTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className="tool-tag"
                  aria-pressed={selected.includes(tag.id)}
                  onClick={() => {
                    const next = new URLSearchParams(params)
                    next.delete('tag')
                    for (const id of selected.includes(tag.id)
                      ? selected.filter((id) => id !== tag.id)
                      : [...selected, tag.id])
                      next.append('tag', id)
                    setParams(next)
                  }}
                >
                  <tag.icon size={15} />
                  {resolve(tag.label)}
                  <span>{tools.filter((tool) => tool.tags.includes(tag.id)).length}</span>
                </button>
              ))}
              {selected.length > 0 && (
                <button
                  className="text-button"
                  onClick={() => {
                    const next = new URLSearchParams(params)
                    next.delete('tag')
                    setParams(next)
                  }}
                >
                  {t('清除标签', 'Clear tags')}
                </button>
              )}
            </div>
            <p className="tool-result-count" role="status">
              {t('显示 {count} / {total} 个工具', 'Showing {count} / {total} tools', {
                count: results.length,
                total: tools.length,
              })}
            </p>
          </>
        }
        right={
          <>
            {windowFilters && desktopResults.length ? (
              <div className={launchpad ? 'desktop-catalog-grid' : 'desktop-catalog-list'}>
                {!launchpad && (
                  <div className="desktop-catalog-columns" aria-hidden="true">
                    <span>{t('名称', 'Name')}</span>
                    <span>{t('标签', 'Tags')}</span>
                  </div>
                )}
                {desktopResults.map((app) => {
                  const key = desktopAppKey(app)
                  const label = resolve(desktopAppTitle(app, style))
                  const description = app.kind === 'tool' ? resolve(app.tool.description) : label
                  const tags =
                    app.kind === 'tool'
                      ? app.tool.tags.map((id) =>
                          resolve(toolTags.find((tag) => tag.id === id)!.label),
                        )
                      : []
                  return (
                    <button
                      type="button"
                      key={key}
                      className={launchpad ? 'desktop-app-tile' : 'desktop-catalog-row'}
                      title={description}
                      aria-label={label}
                      aria-pressed={explorer ? selectedTool === key : undefined}
                      {...desktopAppDragProps(app)}
                      onClick={(event) => {
                        if (explorer) setSelectedTool(key)
                        if (!explorer || event.detail === 0) openApp(app)
                      }}
                      onDoubleClick={explorer ? () => openApp(app) : undefined}
                    >
                      {launchpad ? (
                        <>
                          <DesktopAppGlyph app={app} />
                          <span>{label}</span>
                        </>
                      ) : (
                        <>
                          <span className="desktop-catalog-name">
                            <DesktopAppIcon app={app} size={17} />
                            <span>{label}</span>
                          </span>
                          <span className="desktop-catalog-tags">{tags.join(' / ')}</span>
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : results.length ? (
              <div className="all-tools-grid">
                {results.map((tool, index) => (
                  <article key={tool.id} className="tool-list-card">
                    <ToolLink toolId={tool.id} className="tool-list-link">
                      <span className="catalog-tool-index" aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="catalog-tool-heading">
                        <span className="catalog-tool-icon">
                          <ToolIcon tool={tool} size={24} />
                        </span>
                        <h2>{resolve(tool.title)}</h2>
                      </div>
                      <p>{resolve(tool.description)}</p>
                      <ArrowUpRight size={18} />
                    </ToolLink>
                    <div className="tool-list-footer">
                      <div className="tool-tag-list">
                        {tool.tags.map((id) => (
                          <span key={id}>
                            {resolve(toolTags.find((tag) => tag.id === id)!.label)}
                          </span>
                        ))}
                      </div>
                      <PinToolButton
                        title={resolve(tool.title)}
                        pinned={pinned.includes(tool.id)}
                        onToggle={() => onTogglePin(tool.id)}
                      />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyPanel
                icon={<Search size={30} />}
                title={t('没有匹配的工具', 'No matching tools')}
                description={t(
                  '试试其他关键词，或减少选中的标签。',
                  'Try another search or select fewer tags.',
                )}
              />
            )}
          </>
        }
      />
    </section>
  )
}
