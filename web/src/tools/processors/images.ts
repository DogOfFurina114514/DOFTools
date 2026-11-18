import { LocalizedError } from '../../lib/locale'
import type { ToolRunContext, ToolValues } from '../registry'
import { finished, inputFiles, outputName, pause, status } from './shared'

export async function canvasBlob(canvas: HTMLCanvasElement, type: string, quality = 0.9) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  if (!blob || blob.type !== type)
    throw new LocalizedError(
      '浏览器不支持所选图片格式。',
      'This browser cannot encode the selected image format.',
    )
  return blob
}
export async function convertImages(values: ToolValues, context: ToolRunContext) {
  const files = inputFiles(values, 100, true)
  const result = []
  const type = values.format === 'jpg' ? 'image/jpeg' : `image/${values.format}`
  for (const [index, file] of files.entries()) {
    status(context, `正在转换 ${file.name}`, `Converting ${file.name}`)
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode().catch(() => {
        throw new LocalizedError(`无法读取图片：${file.name}`, `Cannot decode image: ${file.name}`)
      })
      context.signal.throwIfAborted()
      if (image.naturalWidth * image.naturalHeight > 40000000)
        throw new LocalizedError(
          '图片不能超过 4000 万像素。',
          'Images must not exceed 40 megapixels.',
        )
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')!
      if (type === 'image/jpeg') {
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.drawImage(image, 0, 0)
      const blob = await canvasBlob(canvas, type, Number(values.quality) / 100)
      result.push({
        name: `${files.length > 1 ? `${index + 1}-` : ''}${outputName(file.name, String(values.format))}`,
        blob,
      })
      canvas.width = canvas.height = 0
      context.onProgress((index + 1) / files.length)
      await pause(context.signal)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  return finished(result)
}
