import type { ToolRunContext, ToolValues } from '../registry'
import { inputFiles } from './shared'
import { runWorker } from './worker-client'

export function convertMedia(
  values: ToolValues,
  context: ToolRunContext,
  mode: 'video' | 'audio' | 'extract',
) {
  inputFiles(values)
  return runWorker(
    new Worker(new URL('./media.worker.ts', import.meta.url), { type: 'module' }),
    { ...values, mode },
    context,
  )
}
