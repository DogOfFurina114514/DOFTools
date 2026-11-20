import { test, expect, type Page } from '@playwright/test'
import { selectChoice } from './helpers/controls'
import { readFile } from 'node:fs/promises'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell } from 'docx'
import PptxGenJS from 'pptxgenjs'
import * as XLSX from '@e965/xlsx'
import {
  BlobReader,
  BlobWriter,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  TextWriter,
  ZipReader,
  ZipWriter,
} from '@zip.js/zip.js'

test.setTimeout(90000)
let pdf: Uint8Array, word: Uint8Array, ppt: Uint8Array, excel: Uint8Array
test.beforeAll(async () => {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([595, 842]).drawText('Conversion sample 123', { x: 50, y: 740, font, size: 22 })
  pdf = await doc.save()
  word = new Uint8Array(
    await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph({ children: [new TextRun('文档转换测试 Chinese sample 123')] }),
              new Table({
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({ children: [new Paragraph('姓名')] }),
                      new TableCell({ children: [new Paragraph('分数')] }),
                    ],
                  }),
                ],
              }),
            ],
          },
        ],
      }),
    ),
  )
  const slides = new PptxGenJS()
  slides.layout = 'LAYOUT_WIDE'
  slides.addSlide().addText('幻灯片测试 PowerPoint sample 123', {
    x: 1,
    y: 1,
    w: 10,
    h: 1,
    fontFace: 'Microsoft YaHei',
    fontSize: 26,
  })
  slides.addSlide().addText('Second slide 456', { x: 1, y: 1, w: 10, h: 1 })
  ppt = new Uint8Array((await slides.write({ outputType: 'arraybuffer' })) as ArrayBuffer)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['姓名', '分数'],
      ['芙宁娜', 100],
      ['中文 & <test>', 42],
    ]),
    '成绩',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Second sheet'], ['Preserve all sheets']]),
    'Second',
  )
  excel = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }))
})
async function run(
  page: Page,
  id: string,
  name: string,
  bytes: Uint8Array,
  values: Record<string, string | number> = {},
) {
  return page.evaluate(
    async ({ id, name, bytes, values }) => {
      const entry = '/src/tools/index.ts'
      const { toolRegistry } = await import(entry)
      const tool = toolRegistry.get(id)!
      const progress: number[] = []
      const result = await toolRegistry.run(
        id,
        { ...tool.initialValues, ...values, files: [new File([new Uint8Array(bytes)], name)] },
        {
          locale: 'zh-CN',
          signal: new AbortController().signal,
          onProgress: (value: number) => progress.push(value),
        },
      )
      return {
        summary: result.summary,
        progress,
        files: await Promise.all(
          result.files!.map(async (file: { name: string; blob: Blob }) => ({
            name: file.name,
            type: file.blob.type,
            bytes: Array.from(new Uint8Array(await file.blob.arrayBuffer())),
          })),
        ),
      }
    },
    { id, name, bytes: Array.from(bytes), values },
  )
}
async function zipTexts(bytes: number[], pattern: RegExp) {
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)))
  try {
    const entries = await reader.getEntries()
    const texts: string[] = []
    for (const entry of entries)
      if (!entry.directory && pattern.test(entry.filename))
        texts.push(await entry.getData(new TextWriter()))
    return texts.join('\n')
  } finally {
    await reader.close()
  }
}
test('overview counts and bilingual fuzzy task search open the actual tools', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.tool-total strong')).toHaveText('11')
  for (const [id, count] of [
    ['image', 1],
    ['video', 3],
    ['audio', 3],
    ['document', 2],
    ['other', 2],
  ])
    await expect(page.locator(`.category-card[href="/category/${id}"]`)).toContainText(
      `${count} 个工具`,
    )
  for (const query of [
    'PNG转JPG',
    'PNG to JPG',
    'png to jpgg',
    'PDF转Word',
    'PPT to PDF',
    '压缩包解密',
  ]) {
    await page.locator('.search-trigger').click()
    await page.getByRole('textbox', { name: '搜索关键词' }).fill(query)
    const id = query.toLowerCase().includes('png')
      ? 'image-convert'
      : query.includes('压缩')
        ? 'archive-unlock'
        : 'document-convert'
    await expect(page.locator('.search-result').first()).toContainText(
      id === 'image-convert'
        ? '图片格式转换'
        : id === 'archive-unlock'
          ? '压缩包密码恢复'
          : '文档格式转换',
    )
    await page.getByRole('textbox', { name: '搜索关键词' }).press('Enter')
    await expect(page).toHaveURL(new RegExp(`/tool/${id}$`))
    await expect(page.locator('.search-dialog')).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.locator('.search-trigger').click()
  await page.getByRole('textbox', { name: 'Search keywords' }).fill('PNG转JPG')
  await expect(page.locator('.search-result').first()).toContainText('Image format converter')
})
test('image UI produces a JPEG with dimensions and keeps options across language changes', async ({
  page,
}) => {
  await page.goto('/tool/image-convert')
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 16
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#4285ff'
    ctx.fillRect(0, 0, 16, 16)
    return canvas.toDataURL().split(',')[1]
  })
  await page.locator('input[type="file"]').setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: Buffer.from(bytes, 'base64'),
  })
  await selectChoice(page.getByLabel('输出格式', { exact: true }), 'jpg')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.getByLabel('Output format', { exact: true })).toHaveAttribute(
    'data-value',
    'jpg',
  )
  await page.getByRole('button', { name: 'Run tool', exact: true }).click()
  await expect(page.locator('.ui-result')).toContainText('Finished')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download sample.jpg' }).click()
  expect((await download).suggestedFilename()).toBe('sample.jpg')
  const output = await run(
    page,
    'image-convert',
    'sample.png',
    new Uint8Array(Buffer.from(bytes, 'base64')),
    { format: 'jpg' },
  )
  expect(output.files[0].bytes.slice(0, 3)).toEqual([255, 216, 255])
  const dimensions = await page.evaluate(async (bytes) => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]))
    return { w: image.width, h: image.height }
  }, output.files[0].bytes)
  expect(dimensions).toEqual({ w: 32, h: 16 })
})
for (const target of ['docx', 'pptx']) {
  test(`PDF to ${target} preserves rendered pages and editable mode preserves text`, async ({
    page,
  }) => {
    await page.goto('/')
    const appearance = await run(page, 'document-convert', 'sample.pdf', pdf, { format: target })
    const packageReader = new ZipReader(
      new Uint8ArrayReader(new Uint8Array(appearance.files[0].bytes)),
    )
    const entries = await packageReader.getEntries()
    expect(entries.some((entry) => /media\/.+\.png$/.test(entry.filename))).toBe(true)
    await packageReader.close()
    const editable = await run(page, 'document-convert', 'sample.pdf', pdf, {
      format: target,
      pdfMode: 'editable',
    })
    expect(
      await zipTexts(
        editable.files[0].bytes,
        target === 'docx' ? /word\/document.xml$/ : /ppt\/slides\/slide\d+.xml$/,
      ),
    ).toContain('Conversion sample 123')
    expect(editable.progress.at(-1)).toBe(1)
  })
}
for (const source of ['docx', 'pptx']) {
  test(`${source} to PDF generates visible pages and office cross-conversion preserves Chinese`, async ({
    page,
  }) => {
    await page.goto('/')
    const bytes = source === 'docx' ? word : ppt
    const output = await run(page, 'document-convert', `sample.${source}`, bytes, { format: 'pdf' })
    const document = await PDFDocument.load(new Uint8Array(output.files[0].bytes))
    expect(document.getPageCount()).toBe(source === 'pptx' ? 2 : 1)
    // Rendering the generated output checks that pages aren't blank or malformed.
    const valid = await page.evaluate(async (bytes) => {
      const path = '/node_modules/pdfjs-dist/build/pdf.mjs'
      const pdfjs = await import(path)
      pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
      const loading = pdfjs.getDocument({ data: new Uint8Array(bytes) })
      const doc = await loading.promise
      const page = await doc.getPage(1),
        viewport = page.getViewport({ scale: 0.3 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, viewport }).promise
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let dark = 0
      for (let index = 0; index < data.length; index += 4) if (data[index] < 180) dark++
      await loading.destroy()
      return dark
    }, output.files[0].bytes)
    expect(valid).toBeGreaterThan(20)
    const target = source === 'docx' ? 'pptx' : 'docx'
    const crossed = await run(page, 'document-convert', `sample.${source}`, bytes, {
      format: target,
    })
    expect(
      await zipTexts(
        crossed.files[0].bytes,
        target === 'docx' ? /word\/document.xml$/ : /ppt\/slides\/slide\d+.xml$/,
      ),
    ).toContain(source === 'docx' ? '文档转换测试' : '幻灯片测试')
  })
}
for (const target of ['pdf', 'docx', 'pptx', 'xlsx', 'csv', 'txt', 'html']) {
  test(`Excel to ${target} preserves both worksheets`, async ({ page }) => {
    await page.goto('/')
    const output = await run(page, 'document-convert', 'sample.xlsx', excel, { format: target })
    const bytes = new Uint8Array(output.files[0].bytes)
    if (target === 'pdf') expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2)
    else if (target === 'docx' || target === 'pptx') {
      const text = await zipTexts(
        output.files[0].bytes,
        target === 'docx' ? /word\/document.xml$/ : /ppt\/slides\/slide\d+.xml$/,
      )
      expect(text).toContain('芙宁娜')
      expect(text).toContain('Preserve all sheets')
    } else if (target === 'xlsx') expect(XLSX.read(bytes).SheetNames).toEqual(['成绩', 'Second'])
    else if (target === 'csv') {
      expect(output.files[0].name).toBe('sample.csv.zip')
      const text = await zipTexts(output.files[0].bytes, /\.csv$/)
      expect(text).toContain('芙宁娜')
      expect(text).toContain('Preserve all sheets')
    } else {
      const text = new TextDecoder().decode(bytes)
      expect(text).toContain('芙宁娜')
      expect(text).toContain('Preserve all sheets')
      if (target === 'html') expect(text).toContain('&lt;test&gt;')
    }
  })
}
async function encryptedZip(password: string, zipCrypto: boolean) {
  const writer = new ZipWriter(new BlobWriter(), { password, zipCrypto, useWebWorkers: false })
  await writer.add('nested/hello.txt', new BlobReader(new Blob(['verified original content'])))
  await writer.add('second.txt', new BlobReader(new Blob(['second entry'])))
  return new Uint8Array(await (await writer.close()).arrayBuffer())
}
for (const encryption of ['ZipCrypto', 'AES']) {
  test(`${encryption} password recovery verifies contents and outputs an unencrypted ZIP`, async ({
    page,
  }) => {
    await page.goto('/')
    const bytes = await encryptedZip('314', encryption === 'ZipCrypto')
    const result = await run(page, 'archive-unlock', 'encrypted.zip', bytes, {
      mode: 'dictionary',
      dictionary: 'wrong\n314\nother',
    })
    expect(result.summary['zh-CN']).toContain('密码已恢复：314')
    const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(result.files[0].bytes)))
    for (const entry of await reader.getEntries()) {
      expect(entry.encrypted).toBe(false)
      if (!entry.directory)
        expect(await entry.getData(new TextWriter(), { checkSignature: true })).toBe(
          entry.filename === 'second.txt' ? 'second entry' : 'verified original content',
        )
    }
    await reader.close()
  })
}
test('one-click ZIP recovery finds a short numeric password', async ({ page }) => {
  await page.goto('/')
  const result = await run(page, 'archive-unlock', 'encrypted.zip', await encryptedZip('42', true))
  expect(result.summary['zh-CN']).toContain('密码已恢复：42')
})
test('ZIP recovery reports exhausted candidates and cancellation produces no result', async ({
  page,
}) => {
  await page.goto('/tool/archive-unlock')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'encrypted.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(await encryptedZip('hard-unlisted-password', false)),
  })
  await page.getByLabel('最多尝试次数', { exact: true }).fill('2')
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('未能恢复')
  await page.getByLabel('最多尝试次数', { exact: true }).fill('20000')
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('button', { name: '开始处理', exact: true })).toBeEnabled()
  await expect(page.locator('.ui-result')).toHaveCount(0)
})
test('AI uses real registered image conversion and recommends without attachments', async ({
  page,
}) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const entry = '/src/tools/index.ts',
      assistantPath = '/src/lib/assistant-tools.ts'
    await import(entry)
    const { executeAssistantCall, assistantCatalog } = await import(assistantPath)
    const context = { locale: 'en', signal: new AbortController().signal, onProgress: () => {} }
    const call = {
      id: '1',
      name: 'run_tool',
      arguments: { toolId: 'image-convert', parameters: { format: 'jpg' } },
    }
    const recommendation = await executeAssistantCall(call, [], context)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 16
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)))
    const executed = await executeAssistantCall(
      call,
      [new File([blob], 'input.png', { type: 'image/png' })],
      context,
    )
    return {
      recommended: JSON.parse(recommendation.content).executed,
      executed: JSON.parse(executed.content).executed,
      name: executed.files[0].name,
      catalog: assistantCatalog('en').map((tool: { id: string }) => tool.id),
    }
  })
  expect(result.recommended).toBe(false)
  expect(result.executed).toBe(true)
  expect(result.name).toBe('input.jpg')
  expect(result.catalog).toContain('document-convert')
  expect(result.catalog).toContain('video-audio')
})

test('TXT input supports PDF, Word and PPT outputs and tool titles follow the language', async ({
  page,
}) => {
  await page.goto('/tool/document-convert')
  await expect(page).toHaveTitle('文档格式转换 · 芙芙的狗工具箱')
  await expect(page.locator('.breadcrumb')).toContainText('文档格式转换')
  const bytes = new TextEncoder().encode('TXT 中文转换\nText sample 123\nSecond paragraph')
  for (const format of ['pdf', 'docx', 'pptx']) {
    const result = await run(page, 'document-convert', 'sample.txt', bytes, { format })
    if (format === 'pdf')
      expect((await PDFDocument.load(new Uint8Array(result.files[0].bytes))).getPageCount()).toBe(1)
    else
      expect(
        await zipTexts(
          result.files[0].bytes,
          format === 'docx' ? /word\/document.xml$/ : /ppt\/slides\/slide\d+.xml$/,
        ),
      ).toContain('TXT 中文转换')
  }
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page).toHaveTitle('Document format converter · DogOfFurina Toolbox')
})

test('images to PDF accepts multiple selections and preserves page order and dimensions', async ({
  page,
}) => {
  await page.goto('/tool/images-pdf')
  const images = await page.evaluate(() =>
    [
      [32, 16],
      [16, 32],
    ].map(([width, height]) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = width > height ? '#2255ee' : '#ff9900'
      ctx.fillRect(0, 0, width, height)
      return canvas.toDataURL().split(',')[1]
    }),
  )
  await expect(page.locator('input[type="file"]')).toHaveAttribute('multiple', '')
  await page.locator('input[type="file"]').setInputFiles(
    images.map((image, index) => ({
      name: `${index + 1}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(image, 'base64'),
    })),
  )
  await selectChoice(page.getByLabel('页面尺寸', { exact: true }), 'image')
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.locator('.ui-result')).toContainText('已将 2 张图片合并为 PDF')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 images.pdf', exact: true }).click()
  const download = await downloading
  const pdf = await PDFDocument.load(await readFile((await download.path())!))
  expect(pdf.getPageCount()).toBe(2)
  expect(pdf.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([
    [24, 12],
    [12, 24],
  ])
})
