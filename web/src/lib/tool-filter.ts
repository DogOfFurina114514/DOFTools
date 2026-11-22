import { tagOf, type ToolTagId } from '../data/tags'
import type { ToolDefinition } from '../tools/registry'
import { normalizeSearch, searchScore, toolSearchAliases } from './search'

export function filterTools(tools: ToolDefinition[], query: string, tags: readonly ToolTagId[]) {
  const keyword = normalizeSearch(query)
  return tools
    .filter((tool) => tags.every((tag) => tool.tags.includes(tag)))
    .map((tool) => ({
      tool,
      score: Math.max(
        keyword &&
          normalizeSearch(toolSearchAliases[tool.id] ?? '')
            .split(' ')
            .includes(keyword)
          ? 100
          : 0,
        searchScore(query, tool.title['zh-CN']),
        searchScore(query, tool.title.en),
        searchScore(
          query,
          [
            ...Object.values(tool.title),
            ...Object.values(tool.description),
            toolSearchAliases[tool.id] ?? '',
            ...tool.tags.flatMap((tag) => Object.values(tagOf(tag).label)),
          ].join(' '),
        ),
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ tool }) => tool)
}
