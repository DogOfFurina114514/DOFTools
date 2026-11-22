import { bilingual as b, LocalizedError } from '../../lib/locale'
import type { ToolResult, ToolValues } from '../registry'

export function targetBytes(values: ToolValues, maxMiB: number) {
  const size = Number(values.targetSize)
  const multiplier = values.sizeUnit === 'kib' ? 1024 : values.sizeUnit === 'mib' ? 1024 * 1024 : 0
  const bytes = Math.floor(size * multiplier)
  if (!Number.isFinite(bytes) || bytes < 1 || bytes > maxMiB * 1024 * 1024)
    throw new LocalizedError(
      `目标大小必须大于 0 且不超过 ${maxMiB} MiB。`,
      `Target size must be greater than 0 and no more than ${maxMiB} MiB.`,
    )
  return bytes
}

export function displayBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(2)} KiB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

export function compressionSummary(inputSize: number, files: NonNullable<ToolResult['files']>) {
  const outputSize = files.reduce((sum, file) => sum + file.blob.size, 0)
  const change = ((1 - outputSize / inputSize) * 100).toFixed(1)
  return b(
    `处理完成，共 ${files.length} 个文件：${displayBytes(inputSize)} → ${displayBytes(outputSize)}。${outputSize < inputSize ? `减小 ${change}%` : '输出未变小，可降低质量、码率或尺寸。'}`,
    `Finished: ${files.length} file(s), ${displayBytes(inputSize)} → ${displayBytes(outputSize)}. ${outputSize < inputSize ? `${change}% smaller.` : 'Output is not smaller; lower quality, bitrate or dimensions.'}`,
  )
}

export function targetVideoBitrates(
  bytes: number,
  duration: number,
  keepAudio: boolean,
  minimumAudioBitrate = 16000,
) {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new LocalizedError('无法读取有效的视频时长。', 'Cannot read a valid video duration.')
  // Reserve space for the container and codec headers, especially for short clips.
  const budget = Math.floor(((bytes * 0.94 - 4096) * 8) / duration)
  const audio = keepAudio
    ? Math.min(
        Math.max(128000, minimumAudioBitrate),
        Math.max(minimumAudioBitrate, Math.floor((budget * 0.15) / 1000) * 1000),
      )
    : 0
  const video = Math.min(100000000, budget - audio)
  if (video < 16000)
    throw new LocalizedError(
      '目标大小过小，无法分配有效视频码率。请增大目标，或选择移除音轨。',
      'The target is too small for a usable video bitrate. Increase it or remove audio.',
    )
  return { video, audio }
}
