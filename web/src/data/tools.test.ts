import { describe, expect, it } from 'vitest'
import { categories, findTool, searchTools, tools, toolDrafts } from './tools'

describe('framework-only release', () => {
  it('does not expose draft tools through the live registry or search', () => {
    expect(tools).toEqual([])
    expect(searchTools('')).toEqual([])
    expect(searchTools('json')).toEqual([])
    expect(findTool('image-compress')).toBeUndefined()
  })
  it('retains valid draft metadata and the ordered category spaces for later', () => {
    expect(categories.map((category) => category.id)).toEqual([
      'image',
      'video',
      'audio',
      'document',
      'other',
    ])
    expect(new Set(toolDrafts.map((tool) => tool.id)).size).toBe(toolDrafts.length)
    expect(
      toolDrafts.every((tool) => categories.some((category) => category.id === tool.category)),
    ).toBe(true)
  })
})
