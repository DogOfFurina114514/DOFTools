import { LocalizedError } from '../../lib/locale'
import type { ToolRunContext, ToolValues } from '../registry'
import { inputFiles, status } from './shared'
import { runWorker } from './worker-client'

export async function audioToMidi(values: ToolValues, context: ToolRunContext) {
  const [file] = inputFiles(values, 64)
  status(context, '正在解码音频…', 'Decoding audio…')
  let decoded: AudioBuffer
  try {
    const decoder = new OfflineAudioContext(1, 1, 22050)
    decoded = await decoder.decodeAudioData(await file.arrayBuffer())
  } catch {
    context.signal.throwIfAborted()
    return runWorker(
      new Worker(new URL('./midi.worker.ts', import.meta.url), { type: 'module' }),
      { ...values, mode: 'transcribe', pcm: false },
      context,
    )
  }
  context.signal.throwIfAborted()
  if (!Number.isFinite(decoded.duration) || decoded.duration > 180)
    throw new LocalizedError(
      '音频转 MIDI 最长支持 3 分钟，请先截取片段。',
      'Audio to MIDI supports up to 3 minutes. Trim the audio first.',
    )
  const offline = new OfflineAudioContext(
    1,
    Math.max(1, Math.ceil(decoded.duration * 22050)),
    22050,
  )
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const mono = await offline.startRendering()
  context.signal.throwIfAborted()
  context.onProgress(0.1)
  // Reuse the existing cancellable worker protocol; the PCM is never uploaded.
  const pcm = new File([new Float32Array(mono.getChannelData(0)).buffer], file.name, {
    type: 'application/x-f32le',
  })
  return runWorker(
    new Worker(new URL('./midi.worker.ts', import.meta.url), { type: 'module' }),
    { ...values, mode: 'transcribe', pcm: true, files: [pcm] },
    context,
  )
}

export function midiToAudio(values: ToolValues, context: ToolRunContext) {
  inputFiles(values, 8)
  return runWorker(
    new Worker(new URL('./midi.worker.ts', import.meta.url), { type: 'module' }),
    { ...values, mode: 'render' },
    context,
  )
}
