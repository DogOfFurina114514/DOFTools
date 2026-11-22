import { describe, expect, it } from 'vitest'
import { builtinTools } from '../tools/builtins'
import { filterTools } from './tool-filter'

describe('multi-tag tool discovery', () => {
  it('requires all selected tags, regardless of selection order', () => {
    expect(filterTools(builtinTools, '', ['video', 'parse']).map((tool) => tool.id)).toEqual([
      'social-link',
    ])
    expect(filterTools(builtinTools, '', ['parse', 'video']).map((tool) => tool.id)).toEqual([
      'social-link',
    ])
    expect(filterTools(builtinTools, '', ['audio', 'parse'])).toEqual([])
    expect(filterTools(builtinTools, '', ['parse']).map((tool) => tool.id)).toEqual([
      'share-link',
      'social-link',
    ])
    expect(filterTools(builtinTools, '', [])).toHaveLength(16)
  })
  it('combines the intersection with bilingual task search and conversion direction', () => {
    expect(filterTools(builtinTools, '哔哩哔哩', ['parse'])[0].id).toBe('social-link')
    expect(filterTools(builtinTools, 'X', [])[0].id).toBe('social-link')
    expect(filterTools(builtinTools, 'X', ['parse'])[0].id).toBe('social-link')
    expect(filterTools(builtinTools, 'cloud drive', ['video', 'parse'])).toEqual([])
    for (const query of ['视频转GIF', 'video to gif'])
      expect(filterTools(builtinTools, query, [])[0].id).toBe('video-gif')
    for (const query of ['GIF转视频', 'gif to video'])
      expect(filterTools(builtinTools, query, [])[0].id).toBe('gif-video')
    expect(filterTools(builtinTools, 'png to jpgg', [])[0].id).toBe('image-convert')
  })
})
