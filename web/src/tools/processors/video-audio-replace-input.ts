import type { ToolValues } from '../registry'
import { inputFiles } from './shared'

export function replacementFiles(values: ToolValues) {
  const video = inputFiles({ files: values.videoFiles })[0]
  const audio = inputFiles({ files: values.audioFiles })[0]
  inputFiles({ files: [video, audio] }, 256, true)
  return { video, audio }
}
