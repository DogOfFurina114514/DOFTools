import { LocalizedError } from '../../lib/locale'
import type { ParsedShare } from './share-parser'

export const SHARE_SERVICE = 'https://lz.qaiu.top'
export const MAX_SHARE_BYTES = 100 * 1024 * 1024
export type ShareFile = {
  id: string
  name: string
  size?: number
  directory: boolean
  url?: string
  resolverPath?: string
}
export type ShareListing = { files: ShareFile[] }
const invalidResponse = () =>
  new LocalizedError('解析服务返回的数据格式无效。', 'The resolver returned an invalid response.')

export function httpUrl(value: string) {
  try {
    const url = new URL(value)
    if (!url.username && !url.password && ['https:', 'http:'].includes(url.protocol))
      return url.href
  } catch {
    /* Reject unsafe or malformed URLs at the network boundary. */
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidResponse()
  return value as Record<string, unknown>
}
function data(value: unknown) {
  const result = object(value)
  if (result.code !== 200 || result.success !== true) throw invalidResponse()
  return result.data
}
function fileInfo(value: unknown): ShareFile {
  const file = object(value)
  if (
    typeof file.fileId !== 'string' ||
    !file.fileId ||
    file.fileId.length > 1024 ||
    typeof file.fileName !== 'string' ||
    !file.fileName.trim() ||
    file.fileName.length > 1024 ||
    typeof file.fileType !== 'string'
  )
    throw invalidResponse()
  if (
    file.size != null &&
    (typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size < 0)
  )
    throw invalidResponse()
  return {
    id: file.fileId,
    name: file.fileName,
    directory: ['folder', 'directory', 'dir'].includes(file.fileType),
    size: file.size == null ? undefined : (file.size as number),
  }
}
export function validateListing(value: unknown, share: ParsedShare): ShareListing {
  const items = data(value)
  if (!Array.isArray(items) || items.length > 1000) throw invalidResponse()
  const ids = new Set<string>()
  return {
    files: items.map((item) => {
      const source = object(item),
        file = fileInfo(source)
      if (ids.has(file.id)) throw invalidResponse()
      ids.add(file.id)
      if (!file.directory && source.parserUrl != null) {
        if (typeof source.parserUrl !== 'string') throw invalidResponse()
        const url = new URL(httpUrl(source.parserUrl) ?? 'https://invalid.example')
        const kind = share.platform === 'lanzou' ? 'lz' : 'iz'
        // Only use the documented download route; never fetch an arbitrary URL
        // supplied by a service. Normalize both public mirror hosts to our endpoint.
        const path = new RegExp(`^/v2/redirectUrl/${kind}/([a-zA-Z0-9_-]{1,8192})$`).exec(
          url.pathname,
        )
        if (
          !['lz.qaiu.top', 'lz0.qaiu.top'].includes(url.hostname) ||
          url.protocol !== 'https:' ||
          url.port ||
          url.search ||
          url.hash ||
          !path
        )
          throw invalidResponse()
        file.resolverPath = `/v2/getFileDownInfo/${kind}/${path[1]}`
      }
      return file
    }),
  }
}
function requireSmallFile(file: ShareFile) {
  if (file.directory) throw invalidResponse()
  if (file.size === undefined || file.size > MAX_SHARE_BYTES)
    throw new LocalizedError(
      '仅支持不超过 100 MiB 的免登录小文件；无法确认大小或需要登录的文件不支持取链。',
      'Only anonymous files up to 100 MiB are supported. Files with unknown sizes or requiring login cannot be resolved.',
    )
}
export function validateSingle(value: unknown): ShareFile {
  const result = object(data(value))
  const file = fileInfo(result.fileInfo)
  requireSmallFile(file)
  const url = typeof result.directLink === 'string' ? httpUrl(result.directLink) : undefined
  if (!url) throw invalidResponse()
  return { ...file, url }
}

async function request(path: string, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted()
  const timeout = AbortSignal.timeout(30000)
  try {
    const response = await fetch(SHARE_SERVICE + path, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: AbortSignal.any([signal, timeout]),
    })
    if (!response.headers.get('content-type')?.includes('json')) {
      if (!response.ok)
        throw new LocalizedError(
          `解析服务请求失败（HTTP ${response.status}）。`,
          `Resolver request failed (HTTP ${response.status}).`,
        )
      throw invalidResponse()
    }
    if (Number(response.headers.get('content-length') ?? 0) > 2 * 1024 * 1024)
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
        bytes += chunk.value.length
        if (bytes > 2 * 1024 * 1024) {
          await reader.cancel()
          throw invalidResponse()
        }
        pieces.push(decoder.decode(chunk.value, { stream: true }))
      }
      pieces.push(decoder.decode())
    } finally {
      reader.releaseLock()
    }
    signal.throwIfAborted()
    let value: unknown
    try {
      value = JSON.parse(pieces.join(''))
    } catch {
      throw invalidResponse()
    }
    const result = object(value)
    if (
      !response.ok ||
      result.success === false ||
      (result.code !== undefined && result.code !== 200)
    ) {
      // Service messages are rendered as text, never HTML, and kept bounded.
      const detail =
        typeof result.msg === 'string' ? result.msg.slice(0, 500) : `HTTP ${response.status}`
      throw new LocalizedError(`解析失败：${detail}`, `Parsing failed: ${detail}`)
    }
    return value
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof LocalizedError) throw error
    if (timeout.aborted)
      throw new LocalizedError(
        '解析服务响应超时，请稍后重试。',
        'The resolver timed out. Try again later.',
      )
    throw new LocalizedError(
      '无法连接公益解析服务，请检查网络或稍后重试。',
      'Cannot reach the public resolver. Check your connection or try again later.',
    )
  }
}
function query(share: ParsedShare, folderId = '') {
  const url = new URL(share.url)
  url.search = ''
  const params = new URLSearchParams({ url: url.href })
  if (share.password) params.set('pwd', share.password)
  if (folderId) params.set('dirId', folderId)
  return params
}
export async function loadShareFiles(
  share: ParsedShare,
  signal: AbortSignal,
  folderId = '',
): Promise<ShareListing> {
  if (folderId || (share.platform === 'lanzou' && /^b/i.test(share.shareId)))
    return validateListing(
      await request(`/v2/getFileList?${query(share, folderId)}`, signal),
      share,
    )
  const value = await request(`/json/parser?${query(share)}`, signal)
  const result = object(data(value))
  // The Premium API returns a numeric folder ID in directLink for directories.
  if (
    share.platform === 'ilanzou' &&
    typeof result.directLink === 'string' &&
    /^\d+$/.test(result.directLink) &&
    result.fileInfo == null
  )
    return validateListing(await request(`/v2/getFileList?${query(share)}`, signal), share)
  return { files: [validateSingle(value)] }
}
export async function getShareDownload(
  share: ParsedShare,
  file: ShareFile,
  signal: AbortSignal,
): Promise<string> {
  requireSmallFile(file)
  if (!file.resolverPath) {
    if (!file.url) throw invalidResponse()
    return validateSingle(await request(`/json/parser?${query(share)}`, signal)).url!
  }
  const result = object(await request(file.resolverPath, signal))
  if (
    result.needDownloader ||
    (result.downloadHeaders && Object.keys(object(result.downloadHeaders)).length)
  )
    throw new LocalizedError(
      '此文件下载需要额外认证或请求头，暂不支持。',
      'This download requires additional authentication or request headers and is not supported.',
    )
  const url = typeof result.downloadUrl === 'string' ? httpUrl(result.downloadUrl) : undefined
  if (!url) throw invalidResponse()
  return url
}
