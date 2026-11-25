import type { ToolRunContext, ToolValues } from '../registry'
import { LocalizedError } from '../../lib/locale'
import { inputFiles } from './shared'
import { runWorker } from './worker-client'

export function decryptKugou(values: ToolValues, context: ToolRunContext) {
  inputFiles(values, 256, true)
  const keys = values.keyFiles
  if (!Array.isArray(keys) || keys.some((file) => !(file instanceof File)) || keys.reduce((sum, file) => sum + file.size, 0) > 64 * 1024 * 1024) {
    throw new LocalizedError('密钥文件总大小不能超过 64 MiB。', 'Key files must total no more than 64 MiB.')
  }
  return runWorker(new Worker(new URL('./kugou.worker.ts', import.meta.url), { type: 'module' }), values, context)
}
