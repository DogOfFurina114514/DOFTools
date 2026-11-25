import { bilingual as b, errorMessage, localize, LocalizedError } from '../../lib/locale'
import type { ToolResult, ToolRunContext, ToolValues } from '../registry'
import { finished, inputFiles, pause } from './shared'

export function uniqueOutputNames(files: NonNullable<ToolResult['files']>) {
  const used = new Set<string>()
  return files.map((file) => {
    let name = file.name
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const extension = dot > 0 ? name.slice(dot) : ''
    let suffix = 2
    while (used.has(name.toLowerCase())) name = `${stem} (${suffix++})${extension}`
    used.add(name.toLowerCase())
    return { ...file, name }
  })
}

// Each conversion releases its input resources before the next file starts.
export async function runBatch(
  values: ToolValues,
  context: ToolRunContext,
  execute: (values: ToolValues, context: ToolRunContext) => Promise<ToolResult>,
  maxMiB = 256,
): Promise<ToolResult> {
  const inputs = inputFiles(values, maxMiB, true)
  if (inputs.length === 1) return execute(values, context)
  const files: NonNullable<ToolResult['files']> = []
  const details: NonNullable<ToolResult['details']> = []
  let completed = 0
  for (const [index, file] of inputs.entries()) {
    await pause(context.signal)
    const label = `${index + 1}/${inputs.length} · ${file.name}`
    try {
      const result = await execute({ ...values, files: [file] }, {
        ...context,
        onProgress: (progress) => context.onProgress((index + Math.max(0, Math.min(1, progress))) / inputs.length),
        onStatus: (message) => context.onStatus?.(b(`${label} · ${localize('zh-CN', message)}`, `${label} · ${localize('en', message)}`)),
      })
      files.push(...(result.files ?? []))
      details.push(b(`${file.name}：${localize('zh-CN', result.summary)}`, `${file.name}: ${localize('en', result.summary)}`), ...(result.details ?? []))
      completed++
    } catch (error) {
      context.signal.throwIfAborted()
      const message = errorMessage(error)
      details.push(b(`${file.name}：失败 · ${localize('zh-CN', message)}`, `${file.name}: failed · ${localize('en', message)}`))
    }
    context.onProgress((index + 1) / inputs.length)
  }
  if (!completed) throw new LocalizedError(details.map((item) => item['zh-CN']).join('\n'), details.map((item) => item.en).join('\n'))
  return {
    ...finished(uniqueOutputNames(files)),
    summary: b(`批量处理结束：${completed} 个成功，${inputs.length - completed} 个失败。`, `Batch finished: ${completed} succeeded, ${inputs.length - completed} failed.`),
    details,
  }
}
