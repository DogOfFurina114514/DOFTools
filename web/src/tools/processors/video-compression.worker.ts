import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  canEncodeAudio,
} from 'mediabunny'
import { bilingual as b, LocalizedError } from '../../lib/locale'
import type { ToolValues } from '../registry'
import { compressionSummary, displayBytes, targetBytes, targetVideoBitrates } from './compression'

self.onmessage = async ({ data }: MessageEvent<{ values: ToolValues }>) => {
  const values = data.values
  const file = (values.files as File[])[0]
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  const sendStatus = (zh: string, en: string) =>
    self.postMessage({ type: 'status', value: b(zh, en) })
  try {
    sendStatus('正在读取视频时长与轨道…', 'Reading video duration and tracks…')
    const videoTrack = await input.getPrimaryVideoTrack()
    const audioTrack = await input.getPrimaryAudioTrack()
    if (!videoTrack)
      throw new LocalizedError('文件中没有视频轨道。', 'The file has no video track.')
    const duration = await input.computeDuration()
    if (!Number.isFinite(duration) || duration <= 0)
      throw new LocalizedError('无法读取有效的视频时长。', 'Cannot read a valid video duration.')
    const target = values.compressionMode === 'target' ? targetBytes(values, 256) : 0
    const keepAudio =
      !!audioTrack && (target ? values.targetAudio !== 'remove' : Number(values.audioBitrate) > 0)
    const audioCodec = values.format === 'webm' ? 'opus' : 'aac'
    const audioConfig = keepAudio
      ? {
          numberOfChannels: await audioTrack!.getNumberOfChannels(),
          sampleRate: await audioTrack!.getSampleRate(),
        }
      : null
    const supportedAudioBitrates: number[] = []
    if (keepAudio) {
      if (target) {
        // Native AAC encoders can support only specific rates (e.g. 96 / 128 kbps).
        const candidates = [
          16000, 24000, 32000, 48000, 64000, 80000, 96000, 128000, 160000, 192000, 256000, 320000,
        ]
        const support = await Promise.all(
          candidates.map(async (bitrate) =>
            (await canEncodeAudio(audioCodec, { ...audioConfig!, bitrate })) ? bitrate : 0,
          ),
        )
        supportedAudioBitrates.push(...support.filter((bitrate) => bitrate > 0))
        if (!supportedAudioBitrates.length)
          throw new LocalizedError(
            '浏览器不能编码此音轨，请换一种格式或选择移除音轨。',
            'The browser cannot encode this audio track. Try another format or remove audio.',
          )
      } else if (
        !(await canEncodeAudio(audioCodec, {
          ...audioConfig!,
          bitrate: Number(values.audioBitrate) * 1000,
        }))
      ) {
        throw new LocalizedError(
          `浏览器不支持 ${values.audioBitrate} kbps 的音频编码。MP4 可尝试 96 / 128 / 192 kbps，或换用 WebM / 移除音轨。`,
          `The browser cannot encode audio at ${values.audioBitrate} kbps. For MP4 try 96 / 128 / 192 kbps, or use WebM / remove audio.`,
        )
      }
    }
    let bitrates = target
      ? targetVideoBitrates(target, duration, keepAudio, supportedAudioBitrates[0])
      : {
          video: Number(values.videoBitrate) * 1000,
          audio: keepAudio ? Number(values.audioBitrate) * 1000 : 0,
        }
    if (target && keepAudio) {
      const audio = supportedAudioBitrates.filter((rate) => rate <= bitrates.audio).at(-1)!
      bitrates.video += bitrates.audio - audio
      bitrates.audio = audio
    }
    const naturalWidth = await videoTrack.getDisplayWidth()
    const naturalHeight = await videoTrack.getDisplayHeight()
    if (!naturalWidth || !naturalHeight)
      throw new LocalizedError('视频尺寸无效。', 'Video dimensions are invalid.')
    const maximum = values.resolution === 'original' ? 0 : Number(values.resolution)
    let ratio = maximum > 0 ? Math.min(1, maximum / Math.min(naturalWidth, naturalHeight)) : 1
    const requestedFrameRate = Number(values.frameRate)
    const sourceStats = requestedFrameRate > 0 ? await videoTrack.computePacketStats(100) : null
    const frameRate =
      requestedFrameRate > 0
        ? Math.min(requestedFrameRate, sourceStats?.averagePacketRate || requestedFrameRate)
        : 0
    const attempts = target ? 5 : 1
    let progress = 0
    for (let attempt = 0; attempt < attempts; attempt++) {
      const width = Math.max(2, Math.floor((naturalWidth * ratio) / 2) * 2)
      const height = Math.max(2, Math.floor((naturalHeight * ratio) / 2) * 2)
      sendStatus(
        `正在压缩 · 第 ${attempt + 1} 次 · 视频 ${(bitrates.video / 1000).toFixed(0)} kbps · 音频 ${(bitrates.audio / 1000).toFixed(0)} kbps`,
        `Compressing · attempt ${attempt + 1} · video ${(bitrates.video / 1000).toFixed(0)} kbps · audio ${(bitrates.audio / 1000).toFixed(0)} kbps`,
      )
      const format =
        values.format === 'webm'
          ? new WebMOutputFormat()
          : new Mp4OutputFormat({ fastStart: 'in-memory' })
      const targetBuffer = new BufferTarget()
      const conversion = await Conversion.init({
        input,
        output: new Output({ format, target: targetBuffer }),
        tracks: 'primary',
        showWarnings: false,
        video: {
          codec: values.format === 'webm' ? 'vp9' : 'avc',
          bitrate: bitrates.video,
          width,
          height,
          fit: 'contain',
          forceTranscode: true,
          ...(frameRate > 0 && { frameRate }),
        },
        audio: keepAudio
          ? {
              codec: values.format === 'webm' ? 'opus' : 'aac',
              bitrate: bitrates.audio,
              forceTranscode: true,
            }
          : { discard: true },
      })
      if (
        !conversion.isValid ||
        !conversion.utilizedTracks.includes(videoTrack) ||
        (keepAudio && !conversion.utilizedTracks.includes(audioTrack!))
      ) {
        await conversion.cancel()
        throw new LocalizedError(
          '浏览器无法解码输入或编码所选输出，请换一种格式，或使用新版 Chrome / Edge。',
          'This browser cannot decode the input or encode the output. Try another format or a recent Chrome / Edge.',
        )
      }
      conversion.onProgress = (value) => {
        progress = Math.max(progress, Math.min(0.99, (attempt + value) / attempts))
        self.postMessage({ type: 'progress', value: progress })
      }
      await conversion.execute()
      if (!targetBuffer.buffer?.byteLength)
        throw new LocalizedError('没有生成有效输出。', 'No valid output was generated.')
      const blob = new Blob([targetBuffer.buffer], { type: format.mimeType })
      if (!target || blob.size <= target) {
        const name = `${file.name.replace(/\.[^.]+$/, '') || 'video'}-compressed.${values.format}`
        const files = [{ name, blob }]
        self.postMessage({ type: 'progress', value: 1 })
        self.postMessage({
          type: 'result',
          value: {
            summary: compressionSummary(file.size, files),
            files,
            details: [
              b(
                `${width} × ${height}；${duration.toFixed(2)} 秒；视频 ${(bitrates.video / 1000).toFixed(0)} kbps；${keepAudio ? `音频 ${(bitrates.audio / 1000).toFixed(0)} kbps` : '无音轨'}${frameRate ? `；${frameRate.toFixed(2)} fps` : ''}${target ? `；目标 ≤ ${displayBytes(target)}` : ''}`,
                `${width} × ${height}; ${duration.toFixed(2)} seconds; video ${(bitrates.video / 1000).toFixed(0)} kbps; ${keepAudio ? `audio ${(bitrates.audio / 1000).toFixed(0)} kbps` : 'no audio'}${frameRate ? `; ${frameRate.toFixed(2)} fps` : ''}${target ? `; target ≤ ${displayBytes(target)}` : ''}`,
              ),
            ],
          },
        })
        return
      }
      sendStatus(
        `输出 ${displayBytes(blob.size)} 超出目标，正在调整码率与尺寸…`,
        `Output ${displayBytes(blob.size)} exceeds the target; adjusting bitrates and dimensions…`,
      )
      const factor = Math.min(0.8, (target / blob.size) * 0.85)
      bitrates = {
        video: Math.max(16000, Math.floor(bitrates.video * factor)),
        audio: keepAudio
          ? (supportedAudioBitrates.filter((rate) => rate <= bitrates.audio * factor).at(-1) ??
            supportedAudioBitrates[0])
          : 0,
      }
      ratio *= Math.max(0.25, Math.sqrt(factor))
    }
    throw new LocalizedError(
      `无法压缩至 ${displayBytes(target)}。请增大目标大小，或选择移除音轨。`,
      `Cannot fit ${displayBytes(target)}. Increase the target size or remove audio.`,
    )
  } catch (error) {
    self.postMessage({
      type: 'error',
      value:
        error instanceof LocalizedError
          ? error.messages
          : b(
              '视频压缩失败，文件可能损坏或使用了浏览器不支持的编码。',
              'Video compression failed. The file may be damaged or use an unsupported codec.',
            ),
    })
  } finally {
    input.dispose()
  }
}
