import { LocalizedError } from '../../lib/locale'
import type { ToolRunContext } from '../registry'
import type { SocialLink } from './social-parser'
import { httpUrl } from './share-service'

export const SOCIAL_SERVICE = 'https://openapi.dwo.cc/api/svparse'
export const SOCIAL_TIMEOUT_MS = 30000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

export interface SocialMedia {
  kind: 'video' | 'audio' | 'image'
  url: string
  label?: string
  width?: number
  height?: number
  size?: number
  format?: string
  codec?: string
}

/** A provider adapter returns normalized media, never raw provider JSON. */
export interface SocialResolution {
  title?: string
  media: SocialMedia[]
}
export type SocialResolver = (
  link: SocialLink,
  context: ToolRunContext,
) => Promise<SocialResolution>

const invalidResponse = () =>
  new LocalizedError('解析接口返回了无效媒体信息。', 'The resolver returned invalid media data.')

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidResponse()
  return value as Record<string, unknown>
}
function text(value: unknown, max = 200): string | undefined {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string' || value.length > max) throw invalidResponse()
  return value.trim() || undefined
}
function number(value: unknown): number | undefined {
  if (value == null) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw invalidResponse()
  return value
}
function mediaUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 16384) throw invalidResponse()
  const url = httpUrl(value)
  if (!url) throw invalidResponse()
  return url
}

/** Validate both provider output and future adapters at the same boundary. */
export function validateSocialResolution(value: unknown): SocialResolution {
  const result = object(value)
  if (!Array.isArray(result.media) || !result.media.length || result.media.length > 100)
    throw invalidResponse()
  return {
    title: text(result.title, 2000),
    media: result.media.map((value) => {
      const item = object(value)
      if (typeof item.kind !== 'string' || !['video', 'audio', 'image'].includes(item.kind))
        throw invalidResponse()
      return {
        kind: item.kind as SocialMedia['kind'],
        url: mediaUrl(item.url),
        label: text(item.label),
        width: number(item.width),
        height: number(item.height),
        size: number(item.size),
        format: text(item.format, 40),
        codec: text(item.codec, 80),
      }
    }),
  }
}

/** Dwo's documented envelope contains a default URL, backups, images and music. */
export function normalizeSocialResponse(value: unknown): SocialResolution {
  const envelope = object(value)
  if (envelope.code !== 200 && envelope.code !== '200') {
    const detail = typeof envelope.msg === 'string' ? envelope.msg.slice(0, 500) : ''
    throw new LocalizedError(
      `解析失败${detail ? `：${detail}` : '，请检查链接或稍后重试。'}`,
      `Parsing failed${detail ? `: ${detail}` : '. Check the link or try again later.'}`,
    )
  }
  const data = object(envelope.data)
  const media: SocialMedia[] = []
  const add = (value: unknown, kind: SocialMedia['kind']) => {
    if (value == null || value === '') return
    const source = typeof value === 'string' ? { url: value } : object(value)
    const url = mediaUrl(source.url)
    const item: SocialMedia = {
      kind,
      url,
      label: text(source.label) ?? text(source.quality),
      width: number(source.width),
      height: number(source.height),
      size: number(source.size),
      format: text(source.format, 40),
      codec: text(source.codec, 80),
    }
    const previous = media.find((existing) => existing.kind === kind && existing.url === url)
    if (previous) {
      // Backups often repeat the default URL with more useful quality metadata.
      for (const key of ['label', 'width', 'height', 'size', 'format', 'codec'] as const)
        if (previous[key] == null && item[key] != null)
          Object.assign(previous, { [key]: item[key] })
      return
    }
    media.push(item)
    if (media.length > 100) throw invalidResponse()
  }
  const list = (value: unknown, kind: SocialMedia['kind']) => {
    if (value == null) return
    if (!Array.isArray(value) || value.length > 100) throw invalidResponse()
    value.forEach((item) => add(item, kind))
  }
  const kind = ['image', 'images', 'photo', 'album'].includes(String(data.type))
    ? 'image'
    : data.type === 'audio'
      ? 'audio'
      : 'video'
  if (data.url) add(data, kind)
  list(data.urls, kind)
  list(data.video_backup, 'video')
  list(data.audio_backup, 'audio')
  list(data.images, 'image')
  if (data.live_photo != null) {
    if (!Array.isArray(data.live_photo) || data.live_photo.length > 100) throw invalidResponse()
    for (const value of data.live_photo) {
      if (typeof value === 'string') add(value, 'video')
      else {
        const photo = object(value)
        if (photo.url) add(photo, 'video')
        if (photo.video || photo.video_url) add(photo.video || photo.video_url, 'video')
        if (photo.image || photo.image_url) add(photo.image || photo.image_url, 'image')
      }
    }
  }
  if (data.music != null) {
    const music = object(data.music)
    if (music.url) add({ url: music.url, label: music.title }, 'audio')
  }
  return validateSocialResolution({ title: data.title || data.desc, media })
}

export const socialResolver: SocialResolver = async (link, context) => {
  context.signal.throwIfAborted()
  const timeout = AbortSignal.timeout(SOCIAL_TIMEOUT_MS)
  const signal = AbortSignal.any([context.signal, timeout])
  const url = new URL(SOCIAL_SERVICE)
  // Always provide url; a request without it returns the provider's demo video.
  url.searchParams.set('url', link.url)
  try {
    const response = await fetch(url.href, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal,
    })
    if (!response.headers.get('content-type')?.includes('json')) {
      if (!response.ok)
        throw new LocalizedError(
          `解析服务请求失败（HTTP ${response.status}）。`,
          `Resolver request failed (HTTP ${response.status}).`,
        )
      throw invalidResponse()
    }
    if (Number(response.headers.get('content-length') ?? 0) > MAX_RESPONSE_BYTES)
      throw invalidResponse()
    const reader = response.body?.getReader()
    if (!reader) throw invalidResponse()
    const decoder = new TextDecoder(),
      pieces: string[] = []
    let bytes = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > MAX_RESPONSE_BYTES) {
          await reader.cancel()
          throw invalidResponse()
        }
        pieces.push(decoder.decode(chunk.value, { stream: true }))
      }
      pieces.push(decoder.decode())
    } finally {
      reader.releaseLock()
    }
    context.signal.throwIfAborted()
    let value: unknown
    try {
      value = JSON.parse(pieces.join(''))
    } catch {
      throw invalidResponse()
    }
    if (!response.ok) {
      const detail =
        typeof object(value).msg === 'string'
          ? String(object(value).msg).slice(0, 500)
          : `HTTP ${response.status}`
      throw new LocalizedError(`解析失败：${detail}`, `Parsing failed: ${detail}`)
    }
    return normalizeSocialResponse(value)
  } catch (error) {
    context.signal.throwIfAborted()
    if (error instanceof LocalizedError) throw error
    if (timeout.aborted)
      throw new LocalizedError(
        '解析服务响应超时，请稍后重试。',
        'The resolver timed out. Try again later.',
      )
    throw new LocalizedError(
      '无法连接解析服务，请检查网络连接，稍后重试。',
      'Cannot reach the resolver. Check your network connection and try again later.',
    )
  }
}
