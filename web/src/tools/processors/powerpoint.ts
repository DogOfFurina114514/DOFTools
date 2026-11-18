import { LocalizedError } from '../../lib/locale'
import type { ToolRunContext } from '../registry'
import {
  attr,
  blankPage,
  descendants,
  first,
  imageCanvas,
  relationships,
  type OfficeArchive,
} from './office'
import { pause, status } from './shared'

function color(node: Element | undefined, fallback: string) {
  const value = node && first(node, 'srgbClr')?.getAttribute('val')
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : fallback
}
export async function readPowerPoint(archive: OfficeArchive, context: ToolRunContext) {
  const presentation = await archive.xml('ppt/presentation.xml')
  if (!presentation)
    throw new LocalizedError('文件不是有效的 PPTX。', 'This is not a valid PPTX presentation.')
  const size = first(presentation, 'sldSz')
  const emuWidth = Number(attr(size, 'cx') ?? 12192000),
    emuHeight = Number(attr(size, 'cy') ?? 6858000)
  const width = 1440,
    height = Math.round((width * emuHeight) / emuWidth)
  if (height > 3000 || height < 100)
    throw new LocalizedError('幻灯片尺寸异常。', 'The slide dimensions are invalid.')
  const rels = await relationships(archive, 'ppt/presentation.xml')
  const slideNames = descendants(presentation, 'sldId')
    .map((slide) => rels.get(attr(slide, 'r:id') ?? ''))
    .filter((value): value is string => !!value)
  if (!slideNames.length || slideNames.length > 100)
    throw new LocalizedError(
      'PPT 需要包含 1–100 页幻灯片。',
      'PowerPoint must contain 1–100 slides.',
    )
  const pages = []
  for (const [index, name] of slideNames.entries()) {
    status(
      context,
      `正在读取幻灯片 ${index + 1} / ${slideNames.length}`,
      `Reading slide ${index + 1} / ${slideNames.length}`,
    )
    const xml = await archive.xml(name)
    if (!xml) continue
    const page = blankPage()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = color(first(xml, 'bg'), '#fff')
    ctx.fillRect(0, 0, width, height)
    const imageRels = await relationships(archive, name)
    const tree = first(xml, 'spTree')!
    const elements = Array.from(tree.children).flatMap((node) =>
      node.localName === 'grpSp' ? Array.from(node.children) : [node],
    )
    for (const node of elements) {
      const xfrm = first(node, 'xfrm')
      const offset = xfrm && first(xfrm, 'off'),
        ext = xfrm && first(xfrm, 'ext')
      const x = (Number(attr(offset, 'x') ?? 0) / emuWidth) * width
      const y = (Number(attr(offset, 'y') ?? 0) / emuHeight) * height
      const w = (Number(attr(ext, 'cx') ?? emuWidth * 0.9) / emuWidth) * width
      const h = (Number(attr(ext, 'cy') ?? emuHeight * 0.2) / emuHeight) * height
      if (node.localName === 'pic') {
        const imageName = imageRels.get(attr(first(node, 'blip'), 'embed') ?? '')
        const bytes = imageName && (await archive.bytes(imageName))
        if (bytes && imageName) {
          try {
            const image = await imageCanvas(bytes, imageName)
            ctx.drawImage(image, x, y, w, h)
            const blob = await new Promise<Blob | null>((resolve) =>
              image.toBlob(resolve, 'image/png'),
            )
            if (blob)
              page.images.push({
                bytes: new Uint8Array(await blob.arrayBuffer()),
                width: image.width,
                height: image.height,
              })
            image.width = image.height = 0
          } catch {
            /* Legacy vector and unsupported images are omitted. */
          }
        }
      } else if (node.localName === 'sp') {
        const properties = first(node, 'spPr')
        const fill =
          properties &&
          Array.from(properties.children).find((child) => child.localName === 'solidFill')
        if (fill) {
          ctx.fillStyle = color(fill, '#eee')
          ctx.fillRect(x, y, w, h)
        }
        let lineY = y + 6
        for (const paragraph of descendants(node, 'p')) {
          const text = descendants(paragraph, 't')
            .map((t) => t.textContent ?? '')
            .join('')
          if (!text) continue
          page.text.push(text)
          const run = first(paragraph, 'rPr') ?? first(paragraph, 'defRPr')
          const fontSize = Math.min(
            200,
            Math.max(
              12,
              ((Number(attr(run, 'sz') ?? 1800) / 100 / (emuWidth / 914400)) * width) / 72,
            ),
          )
          ctx.font = `${attr(run, 'b') === '1' ? 'bold ' : ''}${fontSize}px "Microsoft YaHei", Arial, sans-serif`
          ctx.fillStyle = color(run, '#222')
          ctx.textBaseline = 'top'
          const lines = wrapText(ctx, text, Math.max(20, w - 12))
          const alignment = attr(first(paragraph, 'pPr'), 'algn')
          for (const line of lines) {
            const measured = ctx.measureText(line).width
            ctx.fillText(
              line,
              x +
                (alignment === 'ctr'
                  ? (w - measured) / 2
                  : alignment === 'r'
                    ? w - measured - 6
                    : 6),
              lineY,
            )
            lineY += fontSize * 1.25
          }
        }
      } else if (node.localName === 'graphicFrame') {
        const table = first(node, 'tbl')
        if (table) {
          const rows = descendants(table, 'tr').map((row) =>
            Array.from(row.children)
              .filter((cell) => cell.localName === 'tc')
              .map((cell) =>
                descendants(cell, 't')
                  .map((t) => t.textContent ?? '')
                  .join(''),
              ),
          )
          page.tables.push(rows)
          const cellHeight = h / Math.max(1, rows.length)
          rows.forEach((row, r) =>
            row.forEach((text, c) => {
              const cw = w / Math.max(1, row.length)
              ctx.strokeStyle = '#bbb'
              ctx.strokeRect(x + c * cw, y + r * cellHeight, cw, cellHeight)
              ctx.font = '20px "Microsoft YaHei", Arial, sans-serif'
              ctx.fillStyle = '#222'
              ctx.fillText(text, x + c * cw + 6, y + r * cellHeight + 8, Math.max(1, cw - 12))
            }),
          )
        }
      }
    }
    page.canvas = canvas
    pages.push(page)
    context.onProgress(0.15 + ((index + 1) / slideNames.length) * 0.55)
    await pause(context.signal)
  }
  return pages
}
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let current = ''
    for (const character of Array.from(paragraph)) {
      if (current && ctx.measureText(current + character).width > maxWidth) {
        lines.push(current)
        current = ''
      }
      current += character
    }
    lines.push(current)
  }
  return lines
}
