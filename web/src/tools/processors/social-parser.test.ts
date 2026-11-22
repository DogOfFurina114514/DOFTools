import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSocialLinks } from './social-parser'
import { resolveSocialLinks } from './social-links'

const context = () => ({
  locale: 'en' as const,
  signal: new AbortController().signal,
  onProgress: () => {},
})
afterEach(() => vi.useRealTimers())
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
  it('identifies additional documented platforms and preserves signed share parameters', () => {
    const cases = [
      ['https://weixin.qq.com/sph/Abcd123', 'wechat'],
      ['https://channels.weixin.qq.com/web/pages/feed?objectId=123', 'wechat'],
      ['https://finder.video.qq.com/251/abc.mp4', 'wechat'],
      ['http://xhslink.com/o/AbCd123', 'xiaohongshu'],
      [
        'https://www.xiaohongshu.com/explore/abc123?xsec_token=Ab%2BC%3D&xsec_source=pc_share',
        'xiaohongshu',
      ],
      ['https://www.xiaohongshu.com/discovery/item/abc123', 'xiaohongshu'],
      ['https://www.instagram.com/reel/Abcd_123/', 'instagram'],
      ['https://v.ixigua.com/Abcd/', 'ixigua'],
      ['https://haokan.baidu.com/v?vid=123', 'haokan'],
      ['https://h5.weishi.qq.com/weishi/feed/share.html?id=abc123', 'weishi'],
      ['https://www.pearvideo.com/video_123', 'pearvideo'],
      ['https://www.acfun.cn/v/ac123', 'acfun'],
      ['https://www.zhihu.com/zvideo/123', 'zhihu'],
      ['https://oasis.weibo.cn/v1/h5/share?sid=abc123', 'oasis'],
      ['https://www.meipai.com/media/123', 'meipai'],
      ['https://quanmin.baidu.com/sv?source=share&vid=123', 'quanmin'],
      ['https://v.huya.com/play/123.html', 'huya'],
    ]
    for (const [url, platform] of cases) {
      const link = parseSocialLinks(url)[0]
      expect(link.platform).toBe(platform)
      expect(link.url).toBe(url.replace(/^http:/, 'https:'))
    }
    for (const url of [
      'https://weixin.qq.com.evil.test/sph/Abcd',
      'https://www.xiaohongshu.com/user/profile/abc123',
      'https://xhslink.com.evil.test/o/Abcd',
      'https://www.instagram.com/some-user/',
    ])
      expect(() => parseSocialLinks(url)).toThrow()
  })
  it('keeps successful batch results when another link fails', async () => {
    const progress = vi.fn()
    const result = await resolveSocialLinks(
      { text: 'https://youtu.be/jNQXAC9IVRw\nhttps://xhslink.com/o/Abcd' },
      { ...context(), onProgress: progress },
      async (link) => {
        if (link.platform === 'xiaohongshu') throw new Error('expired')
        return { media: [{ kind: 'video', url: 'https://example.com/a.mp4' }] }
      },
    )
    expect(result.summary.en).toContain('Resolved 1 / 2 links; 1 failed')
    expect(progress.mock.calls).toEqual([[0.5], [1]])
    await expect(
      resolveSocialLinks({ text: 'https://youtu.be/jNQXAC9IVRw' }, context(), async () => {
        throw new Error('expired')
      }),
    ).rejects.toThrow('expired')
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
    expect(result.summary.en).toContain('Resolved 1 / 1')
  })
  it('allows cancelling the pause before the next batch request', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const resolver = vi.fn(async () => ({
      media: [{ kind: 'video' as const, url: 'https://example.com/a.mp4' }],
    }))
    const pending = resolveSocialLinks(
      { text: 'https://youtu.be/jNQXAC9IVRw\nhttps://xhslink.com/o/Abcd' },
      { ...context(), signal: controller.signal },
      resolver,
    )
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(0)
    expect(resolver).toHaveBeenCalledTimes(1)
    controller.abort()
    await rejected
    await vi.runAllTimersAsync()
    expect(resolver).toHaveBeenCalledTimes(1)
  })
})
