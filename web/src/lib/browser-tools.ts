export function countText(text: string) {
  return {
    characters: Array.from(text).length,
    charactersWithoutSpaces: Array.from(text.replace(/\s/g, '')).length,
    words: (
      text.match(
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu,
      ) ?? []
    ).length,
    lines: text ? text.split(/\r\n|\r|\n/).length : 0,
    paragraphs: text.trim() ? text.trim().split(/(?:\r?\n\s*){2,}/).length : 0,
  }
}

export function formatJson(text: string, indentation = 2): string {
  return JSON.stringify(JSON.parse(text), null, indentation)
}
export function minifyJson(text: string): string {
  return JSON.stringify(JSON.parse(text))
}

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let start = 0; start < bytes.length; start += 8192)
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192))
  return btoa(binary)
}
export function decodeBase64(text: string): string {
  const normalized = text.replace(/\s/g, '')
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/.test(normalized))
    throw new Error('请输入有效的 Base64 编码。')
  const binary = atob(normalized)
  return new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(binary, (char) => char.charCodeAt(0)),
  )
}
export function generateUuids(count = 1): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new Error('生成数量应为 1 到 100 的整数。')
  return Array.from({ length: count }, () => crypto.randomUUID())
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3)
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${['B', 'KB', 'MB', 'GB'][i]}`
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function transformImage(
  file: File,
  options: {
    format: 'image/png' | 'image/jpeg' | 'image/webp'
    quality?: number
    width?: number
    height?: number
  },
) {
  if (!file.type.startsWith('image/')) throw new Error('请选择有效的图片文件。')
  if (file.size > 50 * 1024 * 1024) throw new Error('当前支持 50 MB 以内的图片。')
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('浏览器无法读取这张图片，请尝试 JPG、PNG 或 WebP。')
  })
  try {
    const width = Math.round(
      options.width ??
        (options.height ? (bitmap.width * options.height) / bitmap.height : bitmap.width),
    )
    const height = Math.round(
      options.height ??
        (options.width ? (bitmap.height * options.width) / bitmap.width : bitmap.height),
    )
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 1 ||
      height < 1 ||
      width > 16384 ||
      height > 16384 ||
      width * height > 40_000_000
    )
      throw new Error('图片尺寸需为正整数，单边不超过 16384 像素，总像素不超过 4000 万。')
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器无法处理图片。')
    if (options.format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error('图片导出失败，请减小尺寸后重试。')),
        options.format,
        options.quality ?? 0.8,
      ),
    )
    if (blob.type !== options.format)
      throw new Error('当前浏览器不支持导出这个格式，请选择 PNG 或 JPG。')
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[
      options.format
    ]
    return {
      blob,
      width,
      height,
      originalSize: file.size,
      filename: `${file.name.replace(/\.[^.]+$/, '')}-fufu.${extension}`,
    }
  } finally {
    bitmap.close()
  }
}

export function inspectVideo(
  file: File,
): Promise<{ duration: number; width: number; height: number; size: number; type: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    const cleanup = () => {
      clearTimeout(timeout)
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
    }
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('读取超时，浏览器可能不支持这个视频格式。'))
    }, 15000)
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const result = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        size: file.size,
        type: file.type,
      }
      video.onloadedmetadata = null
      video.onerror = null
      cleanup()
      if (!Number.isFinite(result.duration)) reject(new Error('无法读取视频时长。'))
      else resolve(result)
    }
    video.onerror = () => {
      video.onerror = null
      cleanup()
      reject(new Error('浏览器无法读取该视频，请尝试 MP4 或 WebM。'))
    }
    video.src = url
  })
}
