import { bilingual as b, LocalizedError, type LocalizedText } from '../../lib/locale'
import type { ToolRunContext, ToolValues } from '../registry'
import { canvasBlob } from './images'
import { compressionSummary, displayBytes, targetBytes } from './compression'
import { inputFiles, pause, status } from './shared'

export async function compressImages(values: ToolValues, context: ToolRunContext) {
  const files = inputFiles(values, 100, true)
  if (files.length > 100)
    throw new LocalizedError('一次最多压缩 100 张图片。', 'Compress up to 100 images at a time.')
  const target = values.compressionMode === 'target' ? targetBytes(values, 100) : 0
  const type = values.format === 'jpg' ? 'image/jpeg' : `image/${values.format}`
  const result: { name: string; blob: Blob }[] = []
  const details: LocalizedText[] = []
  for (const [index, file] of files.entries()) {
    status(context, `正在读取 ${file.name}`, `Reading ${file.name}`)
    const url = URL.createObjectURL(file)
    const canvas = document.createElement('canvas')
    try {
      const image = new Image()
      image.src = url
      await image.decode().catch(() => {
        throw new LocalizedError(`无法读取图片：${file.name}`, `Cannot decode image: ${file.name}`)
      })
      context.signal.throwIfAborted()
      const width = image.naturalWidth,
        height = image.naturalHeight
      if (!width || !height || width * height > 40000000)
        throw new LocalizedError(
          '图片尺寸无效或超过 4000 万像素。',
          'Image dimensions are invalid or exceed 40 megapixels.',
        )
      const maximum = Number(values.maxEdge)
      let scale = maximum > 0 ? Math.min(1, maximum / Math.max(width, height)) : 1
      const render = () => {
        canvas.width = Math.max(1, Math.floor(width * scale))
        canvas.height = Math.max(1, Math.floor(height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx)
          throw new LocalizedError(
            '浏览器无法创建图片画布。',
            'The browser cannot create an image canvas.',
          )
        ctx.imageSmoothingQuality = 'high'
        if (type === 'image/jpeg') {
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      }
      const encode = async (quality: number) => {
        await pause(context.signal)
        const blob = await canvasBlob(canvas, type, quality / 100)
        context.signal.throwIfAborted()
        return blob
      }
      let quality = target ? 100 : Number(values.quality)
      render()
      let blob = await encode(quality)
      if (target) {
        for (let attempt = 0; blob.size > target && attempt < 32; attempt++) {
          status(
            context,
            `正在计算 ${file.name} · ${canvas.width} × ${canvas.height}`,
            `Calculating ${file.name} · ${canvas.width} × ${canvas.height}`,
          )
          const smallest = type === 'image/png' ? blob : await encode(1)
          if (smallest.size <= target && type !== 'image/png') {
            let low = 1,
              high = 99
            blob = smallest
            quality = 1
            while (low <= high) {
              const candidateQuality = Math.floor((low + high) / 2)
              const candidate = await encode(candidateQuality)
              if (candidate.size <= target) {
                blob = candidate
                quality = candidateQuality
                low = candidateQuality + 1
              } else high = candidateQuality - 1
            }
            break
          }
          if (canvas.width === 1 && canvas.height === 1) break
          // Jump towards a fitting area while guaranteeing strictly smaller dimensions.
          scale *= Math.min(0.85, Math.max(0.1, Math.sqrt(target / smallest.size) * 0.9))
          render()
          quality = 100
          blob = await encode(quality)
        }
        if (blob.size > target)
          throw new LocalizedError(
            `${file.name} 无法压缩至 ${displayBytes(target)}，请增大目标大小。`,
            `${file.name} cannot fit ${displayBytes(target)}. Increase the target size.`,
          )
      }
      const name = `${files.length > 1 ? `${index + 1}-` : ''}${file.name.replace(/\.[^.]+$/, '') || 'image'}-compressed.${values.format}`
      result.push({ name, blob })
      details.push(
        b(
          `${name}：${displayBytes(file.size)} → ${displayBytes(blob.size)}；${canvas.width} × ${canvas.height}${type === 'image/png' ? '' : `；质量 ${quality}`}${target ? `；目标 ≤ ${displayBytes(target)}` : ''}`,
          `${name}: ${displayBytes(file.size)} → ${displayBytes(blob.size)}; ${canvas.width} × ${canvas.height}${type === 'image/png' ? '' : `; quality ${quality}`}${target ? `; target ≤ ${displayBytes(target)}` : ''}`,
        ),
      )
      context.onProgress((index + 1) / files.length)
    } finally {
      canvas.width = canvas.height = 0
      URL.revokeObjectURL(url)
    }
  }
  return {
    summary: compressionSummary(
      files.reduce((sum, file) => sum + file.size, 0),
      result,
    ),
    files: result,
    details,
  }
}
