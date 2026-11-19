import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseShareLinks } from './share-parser'
import {
  getShareDownload,
  httpUrl,
  loadShareFiles,
  MAX_SHARE_BYTES,
  SHARE_SERVICE,
  validateListing,
  validateSingle,
} from './share-service'

const share = parseShareLinks('https://wwt.lanzouw.com/iAb123?pwd=abcd')[0]
const file = { fileId: 'iAb123', fileName: 'sample.mid', fileType: 'file', size: 1000 }
const envelope = (data: unknown) => ({ code: 200, success: true, data })
const single = envelope({ directLink: 'https://download.example/sample.mid', fileInfo: file })
afterEach(() => vi.unstubAllGlobals())

describe('anonymous share recognition', () => {
  for (const [url, platform, shareId] of [
    ['https://wwx.lanzoui.com/i123AbC', 'lanzou', 'i123AbC'],
    ['https://abc.lanzn.com/b123AbC', 'lanzou', 'b123AbC'],
    ['https://www.ilanzou.com/s/Ab123', 'ilanzou', 'Ab123'],
  ])
    it(`recognizes ${url}`, () => {
      expect(parseShareLinks(`分享：（${url}）。 提取码：aB12`)[0]).toMatchObject({
        platform,
        shareId,
        password: 'aB12',
      })
    })
  it('associates codes with each share, deduplicates and prioritizes URL/manual codes', () => {
    const shares = parseShareLinks(
      'https://wwt.lanzouw.com/iOne 提取码：abcd\nhttps://www.ilanzou.com/s/Two?code=Xy12 密码: xxxx\nhttps://wwx.lanzn.com/iThree\nhttps://wwt.lanzouw.com/iOne?pwd=abcd',
    )
    expect(shares.map((share) => share.password)).toEqual(['abcd', 'Xy12', ''])
    expect(shares[1].url).toBe('https://www.ilanzou.com/s/Two?code=Xy12')
    expect(parseShareLinks(share.url, 'New9')[0].password).toBe('New9')
  })
  for (const url of [
    'https://pan.quark.cn/s/abc',
    'https://pan.baidu.com/s/1abc',
    'https://www.123pan.com/s/AbC-123',
    'https://www.lanzoux.com.evil.example/iabc',
    'https://evil.example/www.lanzoux.com/iabc',
    'https://www.lanzoux.com@suspicious.example/iabc',
    'https://lanzouscam.com/iabc',
    'https://www.ilanzou.com/i123',
    'https://wwt.lanzouw.com/iabc/extra',
  ])
    it(`rejects unsupported or misleading URL ${url}`, () =>
      expect(() => parseShareLinks(url)).toThrow('没有识别'))
  it('bounds batches, share text and access codes', () => {
    expect(() =>
      parseShareLinks(
        Array.from({ length: 21 }, (_, i) => `https://www.lanzoux.com/i${i}`).join('\n'),
      ),
    ).toThrow('20')
    expect(() => parseShareLinks('x'.repeat(20001))).toThrow('20000')
    expect(() => parseShareLinks(share.url, '<script>')).toThrow('提取码')
  })
})

describe('public resolver boundary', () => {
  it('rejects executable URLs, credentials and oversized or unknown single-file sizes', () => {
    expect(httpUrl('javascript:alert(1)')).toBeUndefined()
    expect(httpUrl('https://user:password@example.com')).toBeUndefined()
    expect(validateSingle(single)).toMatchObject({
      id: 'iAb123',
      size: 1000,
      url: 'https://download.example/sample.mid',
    })
    for (const size of [MAX_SHARE_BYTES + 1, undefined])
      expect(() =>
        validateSingle(
          envelope({ directLink: 'https://download.example/file', fileInfo: { ...file, size } }),
        ),
      ).toThrow('100 MiB')
    expect(() =>
      validateSingle(envelope({ directLink: 'javascript:alert(1)', fileInfo: file })),
    ).toThrow('格式无效')
  })
  it('normalizes mirror download routes and rejects malformed or untrusted listings', () => {
    const item = { ...file, parserUrl: 'https://lz0.qaiu.top/v2/redirectUrl/lz/abc_DEF' }
    expect(validateListing(envelope([item]), share).files[0].resolverPath).toBe(
      '/v2/getFileDownInfo/lz/abc_DEF',
    )
    for (const items of [
      [item, item],
      [{ ...item, size: -1 }],
      [{ ...item, parserUrl: 'https://evil.example/v2/redirectUrl/lz/abc' }],
      [{ ...item, parserUrl: 'https://lz.qaiu.top/v2/redirectUrl/iz/abc' }],
      [{ ...item, parserUrl: 'javascript:alert(1)' }],
    ])
      expect(() => validateListing(envelope(items), share)).toThrow('格式无效')
  })
  it('sends only a public link and access code to the built-in service', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(single), { headers: { 'Content-Type': 'application/json' } }),
      )
    vi.stubGlobal('fetch', fetcher)
    expect((await loadShareFiles(share, new AbortController().signal)).files[0].url).toBe(
      'https://download.example/sample.mid',
    )
    const [url, options] = fetcher.mock.calls[0]
    const parsed = new URL(url)
    expect(parsed.origin).toBe(SHARE_SERVICE)
    expect(parsed.pathname).toBe('/json/parser')
    expect([...parsed.searchParams]).toEqual([
      ['url', 'https://wwt.lanzouw.com/iAb123'],
      ['pwd', 'abcd'],
    ])
    expect(options.credentials).toBe('omit')
    expect(options.referrerPolicy).toBe('no-referrer')
    expect(options.headers).toBeUndefined()
  })
  it('recognizes Premium numeric directory results and loads their entries', async () => {
    const premium = parseShareLinks('https://www.ilanzou.com/s/Ab123')[0]
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(envelope({ directLink: '1234', fileInfo: null })), {
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            envelope([{ ...file, parserUrl: 'https://lz.qaiu.top/v2/redirectUrl/iz/param' }]),
          ),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetcher)
    expect(
      (await loadShareFiles(premium, new AbortController().signal)).files[0].resolverPath,
    ).toBe('/v2/getFileDownInfo/iz/param')
    expect(fetcher.mock.calls[1][0]).toContain('/v2/getFileList?')
  })
  it('blocks large downloads before making any request', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(
      getShareDownload(
        share,
        { id: 'large', name: 'large.zip', size: MAX_SHARE_BYTES + 1, directory: false },
        new AbortController().signal,
      ),
    ).rejects.toThrow('100 MiB')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects downloads that need custom headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            downloadUrl: 'https://download.example/file',
            downloadHeaders: { Cookie: 'session' },
            needDownloader: true,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    await expect(
      getShareDownload(
        share,
        {
          id: 'small',
          name: 'small.zip',
          size: 1000,
          directory: false,
          resolverPath: '/v2/getFileDownInfo/lz/param',
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('额外认证')
  })
  it('reports service failures, bounds streamed responses and honors cancellation', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 500, success: false, msg: '提取码错误' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('x'.repeat(2 * 1024 * 1024 + 1), {
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetcher)
    await expect(loadShareFiles(share, new AbortController().signal)).rejects.toThrow('提取码错误')
    await expect(loadShareFiles(share, new AbortController().signal)).rejects.toThrow('格式无效')
    const controller = new AbortController()
    controller.abort()
    await expect(loadShareFiles(share, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
