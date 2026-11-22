import { describe, expect, it } from 'vitest'
import { parseSocialLinks } from './social-parser'
import { resolveSocialLinks } from './social-links'

const context = () => ({
  locale: 'en' as const,
  signal: new AbortController().signal,
  onProgress: () => {},
})
describe('social link identification and adapter boundary', () => {
  it('identifies all six platforms from multiline share text', () => {
    const links = parseSocialLinks(
      '分享： https://www.bilibili.com/video/BV1xx411c7mD。\nhttps://v.douyin.com/abc123/\nhttps://www.kuaishou.com/short-video/abc123\nhttps://twitter.com/user/status/12345\nhttps://youtu.be/jNQXAC9IVRw\nhttps://www.tiktok.com/@user/video/12345',
    )
    expect(links.map((link) => link.platform)).toEqual([
      'bilibili',
      'douyin',
      'kuaishou',
      'x',
      'youtube',
      'tiktok',
    ])
    expect(links[3].url).toBe('https://x.com/user/status/12345')
  })
  it('accepts supported short links, Shorts and mobile links, preserves query information and deduplicates', () => {
    for (const url of [
      'https://b23.tv/Abcd',
      'https://vm.tiktok.com/Abcd/',
      'https://www.tiktok.com/t/Abcd/',
      'https://www.youtube.com/shorts/jNQXAC9IVRw',
      'https://m.youtube.com/watch?v=jNQXAC9IVRw',
    ])
      expect(parseSocialLinks(url)).toHaveLength(1)
    expect(
      parseSocialLinks('http://x.com/u/status/123?s=20#x https://x.com/u/status/123?s=20'),
    ).toEqual([{ platform: 'x', url: 'https://x.com/u/status/123?s=20' }])
  })
  it('rejects lookalike domains, credentials, unsupported pages and limits', () => {
    for (const text of [
      '',
      'https://youtube.com.evil.test/watch?v=jNQXAC9IVRw',
      'https://user:pw@x.com/u/status/1',
      'https://x.com:8443/u/status/1',
      'https://youtube.com/',
      'https://example.com/a',
    ])
      expect(() => parseSocialLinks(text)).toThrow()
    expect(() => parseSocialLinks('a'.repeat(20001))).toThrow()
    expect(() =>
      parseSocialLinks(
        Array.from({ length: 21 }, (_, i) => `https://x.com/u/status/${i}`).join('\n'),
      ),
    ).toThrow()
  })
  it('states the pending API accurately without reporting a media resolution', async () => {
    const result = await resolveSocialLinks({ text: 'https://youtu.be/jNQXAC9IVRw' }, context())
    expect(result.summary.en).toContain('Resolver API pending')
    expect(result.summary.en).not.toContain('Resolved')
  })
  it('validates adapter media and propagates cancellation', async () => {
    const values = { text: 'https://youtu.be/jNQXAC9IVRw' }
    await expect(
      resolveSocialLinks(values, context(), async () => ({
        media: [{ kind: 'video', url: 'javascript:alert(1)' }],
      })),
    ).rejects.toThrow()
    await expect(
      resolveSocialLinks(values, context(), async () => ({ media: [] })),
    ).rejects.toThrow()
    const controller = new AbortController()
    await expect(
      resolveSocialLinks(values, { ...context(), signal: controller.signal }, async () => {
        controller.abort()
        return { media: [{ kind: 'video', url: 'https://example.com/a.mp4' }] }
      }),
    ).rejects.toThrow()
    const result = await resolveSocialLinks(values, context(), async () => ({
      media: [{ kind: 'video', url: 'https://example.com/a.mp4' }],
    }))
    expect(result.summary.en).toContain('Resolved 1')
  })
})
