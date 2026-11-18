import { PDFDocument } from 'pdf-lib'
import { bilingual, LocalizedError } from '../../lib/locale'
import type { ToolRunContext, ToolValues } from '../registry'
import { canvasBlob } from './images'
import { bytesBlob, inputFiles, outputName, pause, status } from './shared'

export async function imagesToPdf(values: ToolValues, context: ToolRunContext) {
  const files = inputFiles(values, 100, true)
  if (files.length > 100)
    throw new LocalizedError('最多合并 100 张图片。', 'At most 100 images can be combined.')
  const pdf = await PDFDocument.create()
  for (const [index, file] of files.entries()) {
    status(
      context,
      `正在添加图片 ${index + 1} / ${files.length}`,
      `Adding image ${index + 1} / ${files.length}`,
    )
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode().catch(() => {
        throw new LocalizedError(`无法读取图片：${file.name}`, `Cannot decode image: ${file.name}`)
      })
      if (image.naturalWidth * image.naturalHeight > 40000000)
        throw new LocalizedError(
          '图片不能超过 4000 万像素。',
          'Images must not exceed 40 megapixels.',
        )
      const ratio = Math.min(1, 3200 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.naturalWidth * ratio)
      canvas.height = Math.round(image.naturalHeight * ratio)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const embedded = await pdf.embedPng(
        await (await canvasBlob(canvas, 'image/png')).arrayBuffer(),
      )
      const landscape = image.naturalWidth > image.naturalHeight
      const [w, h] =
        values.pageSize === 'image'
          ? [image.naturalWidth * 0.75, image.naturalHeight * 0.75]
          : landscape
            ? [841.89, 595.28]
            : [595.28, 841.89]
      const page = pdf.addPage([Math.min(14400, w), Math.min(14400, h)])
      const margin = values.pageSize === 'image' ? 0 : 24
      const scale = Math.min(
        (page.getWidth() - margin * 2) / embedded.width,
        (page.getHeight() - margin * 2) / embedded.height,
      )
      page.drawImage(embedded, {
        x: (page.getWidth() - embedded.width * scale) / 2,
        y: (page.getHeight() - embedded.height * scale) / 2,
        width: embedded.width * scale,
        height: embedded.height * scale,
      })
      canvas.width = canvas.height = 0
      context.onProgress((index + 1) / (files.length + 1))
      await pause(context.signal)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  const blob = bytesBlob(await pdf.save(), 'application/pdf')
  context.onProgress(1)
  return {
    summary: bilingual(
      `已将 ${files.length} 张图片合并为 PDF。`,
      `Combined ${files.length} images into a PDF.`,
    ),
    files: [{ name: files.length === 1 ? outputName(files[0].name, 'pdf') : 'images.pdf', blob }],
  }
}
