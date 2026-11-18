import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  WavOutputFormat,
  OggOutputFormat,
  Mp3OutputFormat,
  FlacOutputFormat,
} from 'mediabunny'
import { bilingual as b, LocalizedError } from '../../lib/locale'
import type { ToolValues } from '../registry'
import { finished, outputName } from './shared'

self.onmessage = async ({ data }: MessageEvent<{ values: ToolValues }>) => {
  const values = data.values
  const file = (values.files as File[])[0]
  const isVideo = values.mode === 'video'
  const target = new BufferTarget()
  const format =
    values.format === 'webm'
      ? new WebMOutputFormat()
      : values.format === 'mp3'
        ? new Mp3OutputFormat()
        : values.format === 'flac'
          ? new FlacOutputFormat()
          : values.format === 'wav'
            ? new WavOutputFormat()
            : values.format === 'ogg'
              ? new OggOutputFormat()
              : new Mp4OutputFormat({ fastStart: 'in-memory' })
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    if (values.format === 'mp3') (await import('@mediabunny/mp3-encoder')).registerMp3Encoder()
    if (values.format === 'flac') (await import('@mediabunny/flac-encoder')).registerFlacEncoder()
    self.postMessage({
      type: 'status',
      value: b('正在读取音视频与检查编码支持…', 'Reading media and checking codec support…'),
    })
    const audioTrack = await input.getPrimaryAudioTrack()
    const videoTrack = await input.getPrimaryVideoTrack()
    if (isVideo && !videoTrack)
      throw new LocalizedError('文件中没有视频轨道。', 'The file has no video track.')
    if (!isVideo && !audioTrack)
      throw new LocalizedError('文件中没有音频轨道。', 'The file has no audio track.')
    const duration = await input.computeDuration()
    const start = Number(values.start ?? 0)
    if (!Number.isFinite(duration) || start >= duration)
      throw new LocalizedError(
        '开始时间必须小于文件时长。',
        'The start time must be before the end of the file.',
      )
    const maximum = values.resolution !== 'original' ? Number(values.resolution) : 0
    const naturalHeight = videoTrack ? await videoTrack.getDisplayHeight() : 0
    const naturalWidth = videoTrack ? await videoTrack.getDisplayWidth() : 0
    const ratio = maximum ? Math.min(1, maximum / Math.min(naturalWidth, naturalHeight)) : 1
    const conversion = await Conversion.init({
      input,
      output: new Output({ format, target }),
      tracks: 'primary',
      showWarnings: false,
      video: isVideo
        ? {
            codec: values.format === 'webm' ? 'vp9' : 'avc',
            ...(ratio < 1 && {
              width: Math.max(2, Math.round((naturalWidth * ratio) / 2) * 2),
              height: Math.max(2, Math.round((naturalHeight * ratio) / 2) * 2),
            }),
          }
        : { discard: true },
      audio: {
        codec:
          values.format === 'wav'
            ? 'pcm-s16'
            : values.format === 'mp3'
              ? 'mp3'
              : values.format === 'flac'
                ? 'flac'
                : ['ogg', 'webm'].includes(String(values.format))
                  ? 'opus'
                  : 'aac',
        ...(values.format !== 'wav' && { bitrate: Number(values.bitrate ?? 192) * 1000 }),
      },
      ...(values.mode === 'extract' && {
        trim: {
          start,
          ...(Number(values.duration) > 0 && {
            end: Math.min(duration, start + Number(values.duration)),
          }),
        },
      }),
    })
    if (
      !conversion.isValid ||
      (isVideo && !conversion.utilizedTracks.includes(videoTrack!)) ||
      (audioTrack && !conversion.utilizedTracks.includes(audioTrack))
    )
      throw new LocalizedError(
        '浏览器无法解码输入或编码所选输出，请换一种格式，或使用新版 Chrome / Edge。',
        'This browser cannot decode the input or encode the output. Try another format or a recent Chrome / Edge.',
      )
    conversion.onProgress = (progress, time) => {
      self.postMessage({ type: 'progress', value: Math.min(0.99, progress) })
      self.postMessage({
        type: 'status',
        value: b(
          `正在转换 · 已处理 ${time.toFixed(1)} 秒`,
          `Converting · ${time.toFixed(1)} seconds processed`,
        ),
      })
    }
    await conversion.execute()
    if (!target.buffer?.byteLength)
      throw new LocalizedError('没有生成有效输出。', 'No valid output was generated.')
    self.postMessage({ type: 'progress', value: 1 })
    self.postMessage({
      type: 'result',
      value: finished([
        {
          name: outputName(file.name, String(values.format)),
          blob: new Blob([target.buffer], { type: format.mimeType }),
        },
      ]),
    })
  } catch (error) {
    self.postMessage({
      type: 'error',
      value:
        error instanceof LocalizedError
          ? error.messages
          : b(
              '音视频处理失败，文件可能损坏或使用了浏览器不支持的编码。',
              'Media processing failed. The file may be damaged or use an unsupported codec.',
            ),
    })
  } finally {
    input.dispose()
  }
}
