import { bilingual, LocalizedError } from '../../lib/locale'
import type { ToolResult, ToolRunContext, ToolValues } from '../registry'

export function inputFiles(values: ToolValues, maxMiB = 256, multiple = false): File[] {
  const files = values.files
  if (!Array.isArray(files) || !files.length || (!multiple && files.length !== 1))
    throw new LocalizedError('请选择待处理的文件。', 'Select the file to process.')
  if (files.some((file) => !(file instanceof File) || !file.size))
    throw new LocalizedError('文件为空或无效。', 'The file is empty or invalid.')
  if (files.reduce((size, file) => size + file.size, 0) > maxMiB * 1024 * 1024)
    throw new LocalizedError(
      `文件总大小不能超过 ${maxMiB} MiB。`,
      `Files must total no more than ${maxMiB} MiB.`,
    )
  return files
}
export function outputName(name: string, extension: string) {
  return `${name.replace(/\.[^.]+$/, '') || 'converted'}.${extension}`
}
export function finished(files: NonNullable<ToolResult['files']>): ToolResult {
  return {
    summary: bilingual(
      `处理完成，共 ${files.length} 个文件。`,
      `Finished: ${files.length} file(s).`,
    ),
    files,
  }
}
export function bytesBlob(bytes: Uint8Array, type: string) {
  return new Blob([Uint8Array.from(bytes).buffer], { type })
}
export function status(context: ToolRunContext, zh: string, en: string) {
  context.signal.throwIfAborted()
  context.onStatus?.(bilingual(zh, en))
}
export function pause(signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<void>((resolve) => setTimeout(resolve, 0)).then(() => signal.throwIfAborted())
}
