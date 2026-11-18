import { BlobReader, TextWriter, Uint8ArrayWriter, ZipReader, type FileEntry } from '@zip.js/zip.js'
import { LocalizedError } from '../../lib/locale'
import type { ToolRunContext } from '../registry'
import { pause, status } from './shared'

export interface ContentImage {
  bytes: Uint8Array
  width: number
  height: number
}
export interface ContentPage {
  text: string[]
  tables: string[][][]
  images: ContentImage[]
  canvas?: HTMLCanvasElement
}
export const blankPage = (): ContentPage => ({ text: [], tables: [], images: [] })
export const descendants = (node: Element | Document, name: string) =>
  Array.from(node.getElementsByTagNameNS('*', name))
export const first = (node: Element | Document, name: string) => descendants(node, name)[0]
export const attr = (node: Element | undefined, name: string) =>
  node?.getAttribute(name) ??
  (node ? Array.from(node.attributes).find((item) => item.localName === name)?.value : undefined)
export function parseXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror'))
    throw new LocalizedError('文档 XML 内容无效。', 'The document contains invalid XML.')
  return doc
}
export async function openOffice(file: File, signal: AbortSignal) {
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false })
  const entries = await reader.getEntries()
  if (
    entries.length > 10000 ||
    entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0) > 128 * 1024 * 1024
  ) {
    await reader.close()
    throw new LocalizedError(
      '文档展开内容超过 128 MiB 或条目过多。',
      'The document exceeds 128 MiB of expanded content or has too many entries.',
    )
  }
  const map = new Map(
    entries
      .filter((entry): entry is FileEntry => !entry.directory)
      .map((entry) => [entry.filename, entry]),
  )
  const get = (name: string) => {
    signal.throwIfAborted()
    const entry = map.get(name)
    if (entry && entry.uncompressedSize > 32 * 1024 * 1024)
      throw new LocalizedError(
        '文档内单个资源超过 32 MiB。',
        'An embedded document resource exceeds 32 MiB.',
      )
    return entry
  }
  return {
    names: [...map.keys()],
    async xml(name: string) {
      const entry = get(name)
      return entry
        ? parseXml(await entry.getData(new TextWriter(), { signal, checkSignature: true }))
        : undefined
    },
    async bytes(name: string) {
      const entry = get(name)
      return entry?.getData(new Uint8ArrayWriter(), { signal, checkSignature: true })
    },
    close: () => reader.close(),
  }
}
export type OfficeArchive = Awaited<ReturnType<typeof openOffice>>
export function resolvePart(base: string, target: string) {
  if (/^(?:[a-z]+:|\/\/)/i.test(target)) return ''
  const result: string[] = target.startsWith('/') ? [] : base.split('/').slice(0, -1)
  for (const part of target.replace(/\\/g, '/').split('/')) {
    if (part === '..') result.pop()
    else if (part !== '.' && part) result.push(part)
  }
  return result.join('/')
}
export async function relationships(archive: OfficeArchive, part: string) {
  const path = part.split('/')
  const name = path.pop()!
  const xml = await archive.xml(`${path.join('/')}/_rels/${name}.rels`)
  return new Map(
    xml
      ? descendants(xml, 'Relationship')
          .filter((item) => attr(item, 'TargetMode') !== 'External')
          .map((item) => [attr(item, 'Id')!, resolvePart(part, attr(item, 'Target')!)])
      : [],
  )
}
export async function imageCanvas(bytes: Uint8Array, name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  const type =
    ext === 'svg'
      ? 'image/svg+xml'
      : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : `image/${ext}`
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (image.naturalWidth * image.naturalHeight > 16000000) throw new Error('Image too large')
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    canvas.getContext('2d')!.drawImage(image, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}
export async function readWord(archive: OfficeArchive, context: ToolRunContext) {
  const xml = await archive.xml('word/document.xml')
  if (!xml)
    throw new LocalizedError('文件不是有效的 DOCX 文档。', 'This is not a valid DOCX document.')
  const page = blankPage()
  const body = first(xml, 'body')!
  for (const node of Array.from(body.children)) {
    if (node.localName === 'tbl')
      page.tables.push(
        descendants(node, 'tr').map((row) =>
          Array.from(row.children)
            .filter((cell) => cell.localName === 'tc')
            .map((cell) =>
              descendants(cell, 't')
                .map((t) => t.textContent ?? '')
                .join(''),
            ),
        ),
      )
    else if (node.localName === 'p')
      page.text.push(
        descendants(node, 't')
          .map((t) => t.textContent ?? '')
          .join(''),
      )
  }
  const rels = await relationships(archive, 'word/document.xml')
  for (const blip of descendants(xml, 'blip')) {
    const name = rels.get(attr(blip, 'embed') ?? '')
    const bytes = name && (await archive.bytes(name))
    if (!bytes || !name) continue
    try {
      const canvas = await imageCanvas(bytes, name)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (blob)
        page.images.push({
          bytes: new Uint8Array(await blob.arrayBuffer()),
          width: canvas.width,
          height: canvas.height,
        })
      canvas.width = canvas.height = 0
    } catch {
      /* Unsupported legacy vector images do not replace editable text. */
    }
  }
  context.signal.throwIfAborted()
  return [page]
}
export async function renderWord(file: File, context: ToolRunContext) {
  const [{ renderAsync }, { default: html2canvas }] = await Promise.all([
    import('docx-preview'),
    import('html2canvas'),
  ])
  const host = document.createElement('div')
  host.className = 'document-render-host'
  host.setAttribute('aria-hidden', 'true')
  document.body.append(host)
  try {
    status(context, '正在排版 Word 页面…', 'Laying out Word pages…')
    await renderAsync(file, host, host, {
      className: 'converted-docx',
      useBase64URL: true,
      renderAltChunks: false,
      ignoreLastRenderedPageBreak: false,
      breakPages: true,
    })
    await document.fonts.ready
    await Promise.all(
      Array.from(host.querySelectorAll('img')).map((image) =>
        image.decode().catch(() => undefined),
      ),
    )
    const sections = Array.from(host.querySelectorAll<HTMLElement>('section.converted-docx'))
    const pages: HTMLCanvasElement[] = []
    for (const [index, section] of sections.entries()) {
      status(context, `正在绘制 Word 第 ${index + 1} 页`, `Rendering Word page ${index + 1}`)
      const rect = section.getBoundingClientRect()
      if (rect.width * Math.max(section.scrollHeight, rect.height) > 10000000)
        throw new LocalizedError(
          'Word 单页过长，请先添加分页符。',
          'A Word page is too long. Add page breaks before converting.',
        )
      const canvas = await html2canvas(section, {
        scale: 1.5,
        backgroundColor: '#fff',
        logging: false,
        useCORS: false,
        height: Math.max(rect.height, section.scrollHeight),
      })
      const pageHeight = Math.round(rect.height * 1.5)
      for (let top = 0; top < canvas.height; top += pageHeight) {
        const part = document.createElement('canvas')
        part.width = canvas.width
        part.height = pageHeight
        const ctx = part.getContext('2d')!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, part.width, part.height)
        ctx.drawImage(
          canvas,
          0,
          top,
          canvas.width,
          Math.min(pageHeight, canvas.height - top),
          0,
          0,
          canvas.width,
          Math.min(pageHeight, canvas.height - top),
        )
        pages.push(part)
        if (pages.length > 100)
          throw new LocalizedError('最多转换 100 页。', 'At most 100 pages can be converted.')
      }
      canvas.width = canvas.height = 0
      context.onProgress(0.2 + ((index + 1) / sections.length) * 0.55)
      await pause(context.signal)
    }
    if (!pages.length)
      throw new LocalizedError('未能生成 Word 页面。', 'No Word pages could be rendered.')
    return pages
  } finally {
    host.remove()
  }
}
