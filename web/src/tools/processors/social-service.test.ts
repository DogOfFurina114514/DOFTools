import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeSocialResponse,
  socialResolver,
  SOCIAL_SERVICE,
  SOCIAL_TIMEOUT_MS,
} from './social-service'

const context = (signal = new AbortController().signal) => ({
  locale: 'en' as const,
  signal,
  onProgress: () => {},
})
const link = {
  platform: 'xiaohongshu' as const,
  url: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=A%2BB%3D&xsec_source=pc_share',
}
const envelope = (data: unknown) => ({ code: 200, data })
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
const sample = envelope({ type: 'video', title: '标题', url: 'https://cdn.example/default.mp4' })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('Dwo social resolver', () => {
  it('normalizes qualities, separate tracks and images, deduplicating default URLs', () => {
    const result = normalizeSocialResponse(
      envelope({
        type: 'video',
        title: '标题',
        url: 'https://cdn.example/default.mp4',
        video_backup: [
          {
            url: 'https://cdn.example/default.mp4',
            label: '720P',
            width: 1280,
            height: 720,
            size: 3000,
          },
          {
            url: 'https://cdn.example/high.m4s',
            quality: '1080p',
            width: 1920,
            height: 1080,
            format: 'mp4',
            codec: 'h264',
          },
        ],
        audio_backup: [{ url: 'https://cdn.example/audio.m4s', label: '132kbps' }],
        images: ['https://cdn.example/cover.jpg'],
        music: { url: 'https://cdn.example/audio.m4s' },
      }),
    )
    expect(result.title).toBe('标题')
    expect(result.media).toHaveLength(4)
    expect(result.media[0]).toMatchObject({ label: '720P', width: 1280, height: 720, size: 3000 })
    expect(result.media[1]).toMatchObject({
      kind: 'video',
      label: '1080p',
      format: 'mp4',
      codec: 'h264',
    })
    expect(result.media.map((item) => item.kind)).toEqual(['video', 'video', 'audio', 'image'])
  })
  it('supports image-only posts, alternate URLs, live photos and music', () => {
    const result = normalizeSocialResponse({
      code: '200',
      data: {
        type: 'images',
        desc: '图集',
        images: ['https://cdn.example/1.jpg', { url: 'https://cdn.example/2.jpg' }],
        urls: [],
        live_photo: [
          { video_url: 'https://cdn.example/live.mp4', image_url: 'https://cdn.example/1.jpg' },
        ],
        music: { title: '背景音乐', url: 'https://cdn.example/music.mp3' },
      },
    })
    expect(result.title).toBe('图集')
    expect(result.media.map((item) => item.kind)).toEqual(['image', 'image', 'video', 'audio'])
    expect(
      normalizeSocialResponse(envelope({ type: 'audio', urls: ['https://cdn.example/a.mp3'] }))
        .media[0].kind,
    ).toBe('audio')
  })
  it('rejects unsafe URLs, malformed media and oversized metadata', () => {
    for (const data of [
      {},
      { url: 'javascript:alert(1)' },
      { url: 'https://user:pw@cdn.example/a.mp4' },
      { url: 'https://cdn.example/a.mp4', title: 'x'.repeat(2001) },
      { images: {} },
      { video_backup: [{ url: 'https://cdn.example/a.mp4', size: -1 }] },
      { images: Array.from({ length: 101 }, (_, i) => `https://cdn.example/${i}.jpg`) },
      { url: 'https://cdn.example/a.mp4', width: '1920' },
    ])
      expect(() => normalizeSocialResponse(envelope(data))).toThrow('无效媒体')
  })
  it('reports provider failures without treating HTTP 200 as parse success', () => {
    expect(() => normalizeSocialResponse({ code: '250', msg: '链接已失效', data: '' })).toThrow(
      '链接已失效',
    )
  })
  it('uses GET with the complete encoded share URL and no credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(sample))
    vi.stubGlobal('fetch', fetcher)
    const result = await socialResolver(link, context())
    expect(result.media[0].url).toBe('https://cdn.example/default.mp4')
    const [target, options] = fetcher.mock.calls[0]
    const url = new URL(target)
    expect(url.origin + url.pathname).toBe(SOCIAL_SERVICE)
    expect([...url.searchParams]).toEqual([['url', link.url]])
    expect(options).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
  })
  it('handles JSON service errors, HTTP failures, invalid JSON and network errors', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ code: 500, msg: '服务异常' }, 500))
      .mockResolvedValueOnce(new Response('limited', { status: 429 }))
      .mockResolvedValueOnce(
        new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }),
      )
      .mockResolvedValueOnce(new Response('{', { headers: { 'Content-Type': 'application/json' } }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetcher)
    for (const expected of ['服务异常', 'HTTP 429', '无效媒体', '无效媒体', '网络或代理'])
      await expect(socialResolver(link, context())).rejects.toThrow(expected)
  })
  it('bounds streamed response bytes even without content-length', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('x'.repeat(2 * 1024 * 1024 + 1), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    await expect(socialResolver(link, context())).rejects.toThrow('无效媒体')
  })
  it('checks cancellation before requesting and during an in-flight GET', async () => {
    const fetcher = vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          })
        }),
    )
    vi.stubGlobal('fetch', fetcher)
    const before = new AbortController()
    before.abort()
    await expect(socialResolver(link, context(before.signal))).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetcher).not.toHaveBeenCalled()
    const during = new AbortController()
    const pending = socialResolver(link, context(during.signal))
    during.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('reports the 30-second request timeout separately from user cancellation', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const timer = new AbortController()
      setTimeout(() => timer.abort(new DOMException('timed out', 'TimeoutError')), ms)
      return timer.signal
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason), {
              once: true,
            })
          }),
      ),
    )
    const pending = expect(socialResolver(link, context())).rejects.toThrow('响应超时')
    await vi.advanceTimersByTimeAsync(SOCIAL_TIMEOUT_MS)
    await pending
  })
})
