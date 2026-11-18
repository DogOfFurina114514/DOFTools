import { PDFDocument } from 'pdf-lib'
import {
  Document as WordDocument,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import PptxGenJS from 'pptxgenjs'
import * as XLSX from '@e965/xlsx'
import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js'
import { bilingual as b, LocalizedError } from '../../lib/locale'
import type { ToolRunContext, ToolValues } from '../registry'
import { blankPage, openOffice, readWord, renderWord, type ContentPage } from './office'
import { readPowerPoint, wrapText } from './powerpoint'
import { bytesBlob, inputFiles, outputName, pause, status } from './shared'
import { canvasBlob } from './images'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const mimes: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
  html: 'text/html;charset=utf-8',
}
async function readPdf(file: File, appearance: boolean, context: ToolRunContext) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const loading = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: '/runtime/pdf/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/runtime/pdf/standard_fonts/',
    wasmUrl: '/runtime/pdf/wasm/',
  })
  const abort = () => {
    void loading.destroy()
  }
  context.signal.addEventListener('abort', abort, { once: true })
  try {
    const pdfDocument = await loading.promise
    if (pdfDocument.numPages > 100)
      throw new LocalizedError('最多转换 100 页 PDF。', 'At most 100 PDF pages can be converted.')
    const pages: ContentPage[] = []
    for (let index = 1; index <= pdfDocument.numPages; index++) {
      status(
        context,
        `正在读取 PDF 第 ${index} / ${pdfDocument.numPages} 页`,
        `Reading PDF page ${index} / ${pdfDocument.numPages}`,
      )
      const pdfPage = await pdfDocument.getPage(index)
      const page = blankPage()
      const text = await pdfPage.getTextContent()
      let line = '',
        lastY: number | undefined
      for (const item of text.items) {
        if (!('str' in item)) continue
        if (lastY !== undefined && Math.abs(item.transform[5] - lastY) > 3 && line) {
          page.text.push(line)
          line = ''
        }
        line += `${line && !line.endsWith(' ') ? ' ' : ''}${item.str}`
        lastY = item.transform[5]
        if (item.hasEOL) {
          page.text.push(line)
          line = ''
        }
      }
      if (line) page.text.push(line)
      if (appearance) {
        const natural = pdfPage.getViewport({ scale: 1 })
        const scale = Math.min(
          2,
          1600 / natural.width,
          Math.sqrt(5000000 / (natural.width * natural.height)),
        )
        const viewport = pdfPage.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        await pdfPage.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
        page.canvas = canvas
      }
      pages.push(page)
      pdfPage.cleanup()
      context.onProgress(0.1 + (index / pdfDocument.numPages) * 0.6)
      await pause(context.signal)
    }
    return pages
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException')
      throw new LocalizedError(
        '请先移除 PDF 的打开密码，再进行转换。',
        'Remove the PDF opening password before converting.',
      )
    throw error
  } finally {
    context.signal.removeEventListener('abort', abort)
    await loading.destroy()
  }
}
function readWorkbook(bytes: ArrayBuffer) {
  const workbook = XLSX.read(bytes, {
    type: 'array',
    cellDates: true,
    dense: true,
    sheetRows: 10001,
  })
  let cells = 0
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    const range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref'] ?? 'A1')
    cells += (range.e.r + 1) * (range.e.c + 1)
    if (range.e.r >= 10000 || range.e.c >= 60 || cells > 100000)
      throw new LocalizedError(
        'Excel 最多支持 10 万单元格、每表 1 万行和 60 列。',
        'Excel supports 100,000 cells total, 10,000 rows and 60 columns per sheet.',
      )
    const rows = XLSX.utils
      .sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
      .map((row) => row.map((value) => String(value)))
    return { name, rows, sheet }
  })
  return { workbook, sheets }
}
function paginateTables(sheets: { name: string; rows: string[][] }[], context: ToolRunContext) {
  const pages: ContentPage[] = []
  for (const sheet of sheets) {
    const columns = Math.max(1, ...sheet.rows.map((row) => row.length))
    for (let column = 0; column < columns; column += 6) {
      for (let row = 0; row < Math.max(1, sheet.rows.length); row += 25) {
        const page = blankPage()
        page.text = [sheet.name]
        page.tables.push(
          sheet.rows
            .slice(row, row + 25)
            .map((values) =>
              Array.from(
                { length: Math.min(6, columns - column) },
                (_, index) => values[column + index] ?? '',
              ),
            ),
        )
        pages.push(page)
        if (pages.length > 100)
          throw new LocalizedError(
            '表格排版超过 100 页，请缩小待转换的范围。',
            'The tables require more than 100 pages. Reduce the conversion range.',
          )
      }
    }
  }
  context.onProgress(0.65)
  return pages
}
function reflow(pages: ContentPage[]) {
  const result: ContentPage[] = []
  for (const page of pages) {
    if (page.canvas) {
      result.push(page)
      continue
    }
    // Bounded pages also prevent huge paragraphs from overflowing a slide.
    const lines = page.text.flatMap((text) => {
      const chars = Array.from(text)
      return chars.length
        ? Array.from({ length: Math.ceil(chars.length / 65) }, (_, index) =>
            chars.slice(index * 65, index * 65 + 65).join(''),
          )
        : ['']
    })
    for (let index = 0; index < Math.max(1, lines.length); index += 22)
      result.push({
        text: lines.slice(index, index + 22),
        tables: index === 0 ? page.tables : [],
        images: index === 0 ? page.images : [],
      })
  }
  if (result.length > 100)
    throw new LocalizedError(
      '重新排版超过 100 页，请拆分文档。',
      'Reflow requires more than 100 pages. Split the document first.',
    )
  return result
}
async function renderContent(page: ContentPage) {
  if (page.canvas) return page.canvas
  const canvas = document.createElement('canvas')
  canvas.width = 1240
  const measure = canvas.getContext('2d')!
  measure.font = '24px "Microsoft YaHei", Arial, sans-serif'
  const textHeight = page.text.reduce(
    (sum, text) => sum + wrapText(measure, text, 1100).length * 34,
    0,
  )
  const tableHeight = page.tables.reduce((sum, table) => {
    const columns = Math.max(1, ...table.map((row) => row.length)),
      cellWidth = 1100 / columns
    return (
      sum +
      table.reduce(
        (height, row) =>
          height +
          Math.max(
            40,
            ...row.map((text) => wrapText(measure, text, cellWidth - 16).length * 28 + 14),
          ),
        0,
      ) +
      20
    )
  }, 0)
  const imageHeight = page.images.reduce(
    (sum, image) => sum + image.height * Math.min(1100 / image.width, 1) + 20,
    0,
  )
  canvas.height = Math.max(1754, Math.ceil(140 + textHeight + tableHeight + imageHeight))
  if (canvas.height > 10000)
    throw new LocalizedError(
      '页面内容过长，请拆分文档或缩短表格单元格内容。',
      'A page is too long. Split the document or shorten table cells.',
    )
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.font = '24px "Microsoft YaHei", Arial, sans-serif'
  ctx.fillStyle = '#222'
  ctx.textBaseline = 'top'
  let y = 70
  for (const paragraph of page.text)
    for (const line of wrapText(ctx, paragraph, 1100)) {
      ctx.fillText(line, 70, y)
      y += 34
    }
  for (const table of page.tables) {
    const columns = Math.max(1, ...table.map((row) => row.length))
    const cellWidth = 1100 / columns
    for (const [index, row] of table.entries()) {
      const wrapped = row.map((text) => wrapText(ctx, text, cellWidth - 16))
      const height = Math.max(40, ...wrapped.map((lines) => lines.length * 28 + 14))
      row.forEach((_, column) => {
        ctx.fillStyle = index === 0 ? '#edf2f7' : '#fff'
        ctx.fillRect(70 + column * cellWidth, y, cellWidth, height)
        ctx.strokeStyle = '#c9d0d9'
        ctx.strokeRect(70 + column * cellWidth, y, cellWidth, height)
        ctx.fillStyle = '#222'
        wrapped[column].forEach((line, lineIndex) =>
          ctx.fillText(line, 78 + column * cellWidth, y + 8 + lineIndex * 28),
        )
      })
      y += height
    }
    y += 20
  }
  for (const image of page.images) {
    const { imageCanvas } = await import('./office')
    const source = await imageCanvas(image.bytes, 'image.png')
    const ratio = Math.min(
      1100 / image.width,
      Math.max(100, canvas.height - y - 70) / image.height,
      1,
    )
    ctx.drawImage(source, 70, y, image.width * ratio, image.height * ratio)
    y += image.height * ratio + 20
    source.width = source.height = 0
  }
  return canvas
}
async function exportPdf(pages: ContentPage[], context: ToolRunContext) {
  const pdf = await PDFDocument.create()
  for (const [index, content] of pages.entries()) {
    status(context, `正在生成 PDF 第 ${index + 1} 页`, `Writing PDF page ${index + 1}`)
    const canvas = await renderContent(content)
    const image = await pdf.embedPng(await (await canvasBlob(canvas, 'image/png')).arrayBuffer())
    const page = pdf.addPage([595.28, (595.28 * canvas.height) / canvas.width])
    page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
    if (canvas !== content.canvas) canvas.width = canvas.height = 0
    context.onProgress(0.7 + ((index + 1) / pages.length) * 0.25)
    await pause(context.signal)
  }
  return bytesBlob(await pdf.save(), mimes.pdf)
}
async function exportWord(pages: ContentPage[], context: ToolRunContext) {
  const sections = []
  for (const [index, page] of pages.entries()) {
    status(context, `正在生成 Word 第 ${index + 1} 页`, `Writing Word page ${index + 1}`)
    const children: (Paragraph | Table)[] = []
    if (page.canvas) {
      const blob = await canvasBlob(page.canvas, 'image/png')
      const width = 600,
        height = Math.round((width * page.canvas.height) / page.canvas.width)
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: 'png',
              data: new Uint8Array(await blob.arrayBuffer()),
              transformation: { width, height },
            }),
          ],
        }),
      )
    } else {
      children.push(
        ...page.text.map(
          (text) =>
            new Paragraph({ children: [new TextRun({ text, font: 'Microsoft YaHei', size: 22 })] }),
        ),
      )
      for (const rows of page.tables)
        if (rows.length)
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: rows.map(
                (row) =>
                  new TableRow({
                    children: row.map((text) => new TableCell({ children: [new Paragraph(text)] })),
                  }),
              ),
            }),
          )
      for (const image of page.images) {
        const ratio = Math.min(600 / image.width, 720 / image.height, 1)
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: 'png',
                data: image.bytes,
                transformation: {
                  width: Math.round(image.width * ratio),
                  height: Math.round(image.height * ratio),
                },
              }),
            ],
          }),
        )
      }
    }
    sections.push({
      properties: {
        page: {
          size: {
            width: 11906,
            height: page.canvas
              ? Math.max(
                  16838,
                  Math.ceil(((600 * page.canvas.height) / page.canvas.width) * 15) + 1200,
                )
              : 16838,
          },
          margin: { top: 600, bottom: 600, left: 600, right: 600 },
        },
      },
      children,
    })
    context.onProgress(0.7 + ((index + 1) / pages.length) * 0.2)
    await pause(context.signal)
  }
  return Packer.toBlob(new WordDocument({ sections }))
}
async function exportPowerPoint(pages: ContentPage[], context: ToolRunContext) {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'DogOfFurina Toolbox'
  pptx.subject = 'Converted document'
  for (const [index, page] of pages.entries()) {
    status(context, `正在生成 PPT 第 ${index + 1} 页`, `Writing PowerPoint slide ${index + 1}`)
    const slide = pptx.addSlide()
    slide.background = { color: 'FFFFFF' }
    if (page.canvas) {
      const data = page.canvas.toDataURL('image/png')
      const ratio = Math.min(13.333 / page.canvas.width, 7.5 / page.canvas.height)
      const w = page.canvas.width * ratio,
        h = page.canvas.height * ratio
      slide.addImage({ data, x: (13.333 - w) / 2, y: (7.5 - h) / 2, w, h })
    } else {
      slide.addText(page.text.join('\n'), {
        x: 0.5,
        y: 0.35,
        w: 12.3,
        h: page.tables.length || page.images.length ? 2 : 6.7,
        fontSize: 18,
        fontFace: 'Microsoft YaHei',
        color: '222222',
        breakLine: false,
        fit: 'shrink',
        valign: 'top',
        margin: 0,
      })
      let y = page.text.length ? 2.5 : 0.5
      for (const table of page.tables)
        if (table.length) {
          slide.addTable(
            table.map((row) => row.map((text) => ({ text }))),
            {
              x: 0.5,
              y,
              w: 12.3,
              h: Math.min(4.5, table.length * 0.2),
              fontSize: 11,
              fontFace: 'Microsoft YaHei',
              border: { pt: 0.5, color: 'CCD3DB' },
              margin: 0.03,
              autoPage: false,
            },
          )
          y += Math.min(4.5, table.length * 0.2)
        }
      for (const image of page.images) {
        const { imageCanvas } = await import('./office')
        const canvas = await imageCanvas(image.bytes, 'image.png')
        const ratio = Math.min(5 / image.width, 3 / image.height)
        slide.addImage({
          data: canvas.toDataURL(),
          x: 0.5,
          y: Math.min(4.2, y),
          w: image.width * ratio,
          h: image.height * ratio,
        })
        canvas.width = canvas.height = 0
      }
    }
    context.onProgress(0.7 + ((index + 1) / pages.length) * 0.2)
    await pause(context.signal)
  }
  return (await pptx.write({ outputType: 'blob' })) as Blob
}
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )
function textRows(page: ContentPage) {
  return [...page.text.map((text) => [text]), ...page.tables.flatMap((table) => table)]
}
export async function convertDocument(values: ToolValues, context: ToolRunContext) {
  const file = inputFiles(values, 64)[0]
  const extension = file.name.split('.').pop()?.toLowerCase()
  const format = String(values.format)
  if (!['pdf', 'docx', 'pptx', 'xlsx', 'xls', 'csv', 'txt'].includes(extension ?? ''))
    throw new LocalizedError(
      '请选择 PDF、DOCX、PPTX、XLSX、XLS、CSV 或 TXT。',
      'Select PDF, DOCX, PPTX, XLSX, XLS, CSV or TXT.',
    )
  if (extension === format && ['pdf', 'docx', 'pptx'].includes(format))
    return {
      summary: b(
        '文件已是目标格式，原样导出。',
        'The file is already in the target format; exported unchanged.',
      ),
      files: [{ name: file.name, blob: file }],
    }
  let pages: ContentPage[] = []
  let spreadsheet: ReturnType<typeof readWorkbook> | undefined
  let archive: Awaited<ReturnType<typeof openOffice>> | undefined
  try {
    status(context, '正在读取文档…', 'Reading document…')
    const isSpreadsheet = ['xls', 'xlsx', 'csv'].includes(extension!)
    if (isSpreadsheet) {
      spreadsheet = readWorkbook(await file.arrayBuffer())
      pages =
        format === 'pdf' || format === 'pptx' || format === 'docx'
          ? paginateTables(spreadsheet.sheets, context)
          : spreadsheet.sheets.map((sheet) => ({
              text: [sheet.name],
              tables: [sheet.rows],
              images: [],
            }))
    } else if (extension === 'txt') {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let text: string
      if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le').decode(bytes)
      else if (bytes[0] === 0xfe && bytes[1] === 0xff)
        text = new TextDecoder('utf-16be').decode(bytes)
      else {
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        } catch {
          text = new TextDecoder('gb18030').decode(bytes)
        }
      }
      if (text.includes('\0'))
        throw new LocalizedError(
          'TXT 含有二进制内容，请选择有效的文本文件。',
          'This TXT contains binary data. Select a valid text file.',
        )
      const page = blankPage()
      page.text = text.replace(/\r\n?/g, '\n').split('\n')
      pages = ['pdf', 'pptx'].includes(format) ? reflow([page]) : [page]
    } else if (extension === 'pdf') {
      const appearance = values.pdfMode === 'appearance' && ['docx', 'pptx'].includes(format)
      pages = await readPdf(file, appearance, context)
      if (!appearance && !pages.some((page) => page.text.some((text) => text.trim())))
        throw new LocalizedError(
          'PDF 没有可提取文字。转 Word / PPT 时请选择“保留外观”；文字识别暂未提供。',
          'The PDF has no extractable text. Choose page images for Word / PowerPoint; OCR is not available yet.',
        )
    } else {
      archive = await openOffice(file, context.signal)
      if (extension === 'docx') {
        if (format === 'pdf')
          pages = (await renderWord(file, context)).map((canvas) => ({ ...blankPage(), canvas }))
        else pages = await readWord(archive, context)
      } else {
        pages = await readPowerPoint(archive, context)
        // For editable Word/PPT exports, use the extracted content rather than slide images.
        if (format !== 'pdf')
          pages.forEach((page) => {
            page.canvas!.width = page.canvas!.height = 0
            delete page.canvas
          })
      }
    }
    context.signal.throwIfAborted()
    let blob: Blob
    if (format === 'csv') {
      const csvFiles = spreadsheet
        ? spreadsheet.sheets.map((sheet) => ({
            name: `${sheet.name.replace(/[\\/:*?"<>|]/g, '_')}.csv`,
            data: XLSX.utils.sheet_to_csv(sheet.sheet),
          }))
        : [
            {
              name: outputName(file.name, 'csv'),
              data: XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(pages.flatMap(textRows))),
            },
          ]
      if (csvFiles.length > 1) {
        const zip = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false })
        for (const [index, item] of csvFiles.entries())
          await zip.add(
            `${index + 1}-${item.name}`,
            new BlobReader(new Blob(['\uFEFF', item.data])),
            { signal: context.signal },
          )
        blob = await zip.close()
        context.onProgress(1)
        return {
          summary: b(
            '每个工作表已导出为 CSV，并打包为 ZIP。',
            'Each sheet was exported as CSV and bundled into a ZIP.',
          ),
          files: [{ name: outputName(file.name, 'csv.zip'), blob }],
        }
      }
      blob = new Blob(['\uFEFF', csvFiles[0].data], { type: mimes.csv })
    } else if (format === 'xlsx') {
      const workbook = spreadsheet?.workbook ?? XLSX.utils.book_new()
      if (!spreadsheet)
        pages.forEach((page, index) =>
          XLSX.utils.book_append_sheet(
            workbook,
            XLSX.utils.aoa_to_sheet(textRows(page)),
            `Page ${index + 1}`,
          ),
        )
      blob = bytesBlob(
        new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })),
        mimes.xlsx,
      )
    } else if (format === 'txt') {
      blob = new Blob(
        [
          pages
            .map((page) =>
              textRows(page)
                .map((row) => row.join('\t'))
                .join('\n'),
            )
            .join('\n\n'),
        ],
        { type: mimes.txt },
      )
    } else if (format === 'html') {
      const html = pages
        .map(
          (page) =>
            `${page.text.map((text) => `<p>${escapeHtml(text)}</p>`).join('')}${page.tables.map((table) => `<table>${table.map((row) => `<tr>${row.map((text) => `<td>${escapeHtml(text)}</td>`).join('')}</tr>`).join('')}</table>`).join('')}`,
        )
        .join('<hr>')
      blob = new Blob(
        [
          `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(file.name)}</title><style>body{font:16px sans-serif;margin:32px}td{border:1px solid #ccc;padding:6px}table{border-collapse:collapse}</style></head><body>${html}</body></html>`,
        ],
        { type: mimes.html },
      )
    } else {
      if (format === 'pptx') pages = reflow(pages)
      blob =
        format === 'pdf'
          ? await exportPdf(pages, context)
          : format === 'docx'
            ? await exportWord(pages, context)
            : await exportPowerPoint(pages, context)
    }
    context.onProgress(1)
    return {
      summary:
        format === 'pdf'
          ? b(
              'PDF 已生成，页面按图像保存，适合阅读和分享。',
              'PDF created with rendered page images, suitable for reading and sharing.',
            )
          : extension === 'pdf' &&
              values.pdfMode === 'appearance' &&
              ['docx', 'pptx'].includes(format)
            ? b(
                '已保留 PDF 页面外观，Word / PPT 中的页面是图片，不能直接编辑文字。',
                'PDF appearance preserved as page images in Word / PowerPoint; the page text is not editable.',
              )
            : b(
                '转换完成。复杂排版、图表、宏、动画与公式计算不保证保留。',
                'Conversion finished. Complex layouts, charts, macros, animations and formula calculations may not be preserved.',
              ),
      files: [{ name: outputName(file.name, format), blob }],
    }
  } catch (error) {
    if (error instanceof LocalizedError || context.signal.aborted) throw error
    if (import.meta.env.DEV) console.error('Document conversion failed', error)
    throw new LocalizedError(
      '文档转换失败，文件可能损坏、加密或包含不支持的内容。',
      'Document conversion failed. The file may be damaged, encrypted or contain unsupported content.',
    )
  } finally {
    await archive?.close()
    pages.forEach((page) => {
      if (page.canvas) page.canvas.width = page.canvas.height = 0
    })
  }
}
