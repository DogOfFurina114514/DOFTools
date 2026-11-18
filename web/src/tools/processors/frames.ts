import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js'
import { bilingual, LocalizedError } from '../../lib/locale'
import type { ToolRunContext, ToolValues } from '../registry'
import { canvasBlob } from './images'
import { inputFiles, outputName, status } from './shared'

function waitFor(video: HTMLVideoElement, event: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => fail(), 30000)
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener(event, done)
      video.removeEventListener('error', fail)
      signal.removeEventListener('abort', abort)
    }
    const done = () => {
      cleanup()
      resolve()
    }
    const fail = () => {
      cleanup()
      reject(
        new LocalizedError(
          '视频无法播放或定位到指定帧。',
          'The video cannot be played or seeked to the requested frame.',
        ),
      )
    }
    const abort = () => {
      cleanup()
      reject(signal.reason)
    }
    video.addEventListener(event, done, { once: true })
    video.addEventListener('error', fail, { once: true })
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}
export async function extractFrames(values: ToolValues, context: ToolRunContext) {
  const file = inputFiles(values)[0]
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  const zip = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false })
  try {
    status(context, '正在读取视频…', 'Reading video…')
    const ready = waitFor(video, 'loadeddata', context.signal)
    video.src = url
    await ready
    const start = Number(values.start)
    if (!Number.isFinite(video.duration) || start >= video.duration)
      throw new LocalizedError(
        '开始时间必须小于视频时长。',
        'The start time must be before the end of the video.',
      )
    const count = Math.min(
      Number(values.count),
      Math.ceil((video.duration - start) / Number(values.interval)),
    )
    const canvas = document.createElement('canvas')
    const ratio = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * ratio)
    canvas.height = Math.round(video.videoHeight * ratio)
    const ctx = canvas.getContext('2d')!
    const type = values.format === 'jpg' ? 'image/jpeg' : `image/${values.format}`
    const manifest = []
    for (let index = 0; index < count; index++) {
      const time = start + index * Number(values.interval)
      status(
        context,
        `正在提取第 ${index + 1} / ${count} 帧`,
        `Extracting frame ${index + 1} / ${count}`,
      )
      if (Math.abs(video.currentTime - time) > 0.00001) {
        const seeked = waitFor(video, 'seeked', context.signal)
        video.currentTime = time
        await seeked
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const name = `frame-${String(index + 1).padStart(4, '0')}-${time.toFixed(3)}s.${values.format}`
      await zip.add(name, new BlobReader(await canvasBlob(canvas, type)), {
        level: 0,
        signal: context.signal,
      })
      manifest.push({ file: name, seconds: time })
      context.onProgress((index + 1) / (count + 1))
    }
    await zip.add('frames.json', new BlobReader(new Blob([JSON.stringify(manifest, null, 2)])), {
      signal: context.signal,
    })
    const blob = await zip.close()
    canvas.width = canvas.height = 0
    context.onProgress(1)
    return {
      summary: bilingual(
        `已提取 ${count} 帧，ZIP 中包含时间记录。`,
        `Extracted ${count} frames. The ZIP includes timestamps.`,
      ),
      files: [{ name: outputName(file.name, 'frames.zip'), blob }],
    }
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}
