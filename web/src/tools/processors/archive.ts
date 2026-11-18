import type { ToolRunContext, ToolValues } from '../registry'
import { inputFiles } from './shared'
import { runWorker } from './worker-client'
export function recoverArchive(values: ToolValues, context: ToolRunContext) {
  inputFiles(values, 128)
  return runWorker(
    new Worker(new URL('./archive.worker.ts', import.meta.url), { type: 'module' }),
    values,
    context,
  )
}
