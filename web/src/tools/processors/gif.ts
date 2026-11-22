import type { ToolRunContext, ToolValues } from '../registry'
import { inputFiles } from './shared'
import { runWorker } from './worker-client'

export function convertGif(
  values: ToolValues,
  context: ToolRunContext,
  mode: 'video-gif' | 'gif-video',
) {
  inputFiles(values, 128)
  return runWorker(
    new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' }),
    { ...values, mode },
    context,
  )
}
