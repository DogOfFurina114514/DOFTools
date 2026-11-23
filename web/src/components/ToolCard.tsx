import { ArrowUpRight, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { categoryOf, type Tool } from '../data/tools'
import { ToolIcon } from './ToolIcon'

export function ToolCard({
  tool,
  favorite,
  onFavorite,
}: {
  tool: Tool
  favorite: boolean
  onFavorite: (id: string) => void
}) {
  return (
    <article className="tool-card">
      <div className="tool-card-top">
        <span className={`tool-icon ${categoryOf(tool.category).color}`}>
          <ToolIcon tool={tool} size={24} strokeWidth={1.65} />
        </span>
        <button
          className={`favorite-button ${favorite ? 'is-favorite' : ''}`}
          aria-label={`${favorite ? '取消收藏' : '收藏'}${tool.name}`}
          aria-pressed={favorite}
          onClick={() => onFavorite(tool.id)}
        >
          <Star size={17} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <Link className="tool-card-link" to={`/tool/${tool.id}`}>
        <h3>
          {tool.name}
          {tool.badge && <span className="popular-badge">{tool.badge}</span>}
        </h3>
        <p>{tool.description}</p>
        <span className="stretched-link" />
      </Link>
      <div className="tool-card-bottom">
        <span>{tool.tags.join(' · ')}</span>
        {tool.kind === 'planned' ? (
          <span className="planned-label">筹备中</span>
        ) : (
          <ArrowUpRight size={17} />
        )}
      </div>
    </article>
  )
}
