import { BookSpread } from '../components/BookSpread'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Search, X } from 'lucide-react'
import { toolTags, isToolTag } from '../data/tags'
import { useLocale } from '../lib/i18n'
import { toolRegistry } from '../tools/registry'
import { filterTools } from '../lib/tool-filter'
import { PinToolButton } from '../components/PinToolButton'
import { EmptyPanel } from '../components/UI'
import { ToolIcon } from '../components/ToolIcon'

export function AllTools({
  pinned,
  onTogglePin,
}: {
  pinned: string[]
  onTogglePin: (id: string) => void
}) {
  const { t, resolve } = useLocale()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const selected = [...new Set(params.getAll('tag').filter(isToolTag))]
  const query = params.get('q') ?? ''
  const tools = toolRegistry.list()
  const results = filterTools(tools, query, selected)
  return (
    <section className="tool-catalog">
      <BookSpread left={<>
      <div className="catalog-header">
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
              if (event.key === 'Enter' && results[0]) navigate(`/tool/${results[0].id}`)
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
          <kbd>Ctrl / ⌘ K</kbd>
        </div>
      </div>
      <div className="tool-tag-filters" role="group" aria-label={t('标签筛选', 'Filter by tags')}>
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
      </>} right={<>
      {results.length ? (
        <div className="all-tools-grid">
          {results.map((tool, index) => (
            <article key={tool.id} className="tool-list-card">
              <Link to={`/tool/${tool.id}`} className="tool-list-link">
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
              </Link>
              <div className="tool-list-footer">
                <div className="tool-tag-list">
                  {tool.tags.map((id) => (
                    <span key={id}>{resolve(toolTags.find((tag) => tag.id === id)!.label)}</span>
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
      </>} />
    </section>
  )
}
