import type { ToolRunContext, ToolValues } from '../registry'
import { replacementFiles } from './video-audio-replace-input'
import { runWorker } from './worker-client'

export function replaceVideoAudio(values: ToolValues, context: ToolRunContext) {
  replacementFiles(values)
  return runWorker(
    new Worker(new URL('./video-audio-replace.worker.ts', import.meta.url), { type: 'module' }),
    values,
    context,
  )
}
