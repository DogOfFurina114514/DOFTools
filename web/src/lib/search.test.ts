import { describe, expect, it } from 'vitest'
import { searchScore, toolSearchAliases } from './search'
describe('bilingual fuzzy task search', () => {
  for (const query of ['PNG转JPG', 'PNG to JPG', 'png to jpgg', 'jpeg 转 png', '把图片转换为webp'])
    it(`finds image conversion for ${query}`, () =>
      expect(searchScore(query, toolSearchAliases['image-convert'])).toBeGreaterThan(0))
  for (const query of ['PDF转Word', 'PPT to PDF', 'Excel转PDF', 'xlsx to ppt', 'pdf to docx'])
    it(`finds document conversion for ${query}`, () =>
      expect(searchScore(query, toolSearchAliases['document-convert'])).toBeGreaterThan(0))
  it('does not match unrelated format pairs', () => {
    expect(searchScore('PNG to JPG', toolSearchAliases['video-convert'])).toBe(0)
    expect(searchScore('PDF to Word', toolSearchAliases['image-convert'])).toBe(0)
    expect(searchScore('missing-unicorn-tool', toolSearchAliases['document-convert'])).toBe(0)
  })
})
