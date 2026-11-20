import { Midi } from '@tonejs/midi'
import { bilingual as b, LocalizedError } from '../../lib/locale'
import type { ToolResult, ToolValues } from '../registry'
import { bytesBlob, outputName } from './shared'
import { parseMidi, synthesizeMidi } from './midi-synth'
import { decodeMidiAudio, encodeMidiAudio } from './midi-codecs'
import { midiAudioFormats, type MidiAudioFormat } from './midi-formats'
import { resourceBase } from '../../lib/site-resources'

self.onmessage = async ({ data }: MessageEvent<{ values: ToolValues }>) => {
  const values = data.values,
    file = (values.files as File[])[0]
  const assetsBase = resourceBase(new URL(import.meta.env.BASE_URL, self.location.href).href)
  const progress = (value: number) => self.postMessage({ type: 'progress', value })
  const status = (zh: string, en: string) => self.postMessage({ type: 'status', value: b(zh, en) })
  try {
    let result: ToolResult
    if (values.mode === 'transcribe') {
      status('正在解码音频…', 'Decoding audio…')
      const samples = values.pcm
        ? new Float32Array(await file.arrayBuffer())
        : await decodeMidiAudio(new Uint8Array(await file.arrayBuffer()), () => progress(0.05))
      status('正在加载本地音符识别模型…', 'Loading the local note transcription model…')
      const tf = await import('@tensorflow/tfjs')
      const { BasicPitch, outputToNotesPoly, noteFramesToTime } =
        await import('@spotify/basic-pitch')
      try {
        const wasm = await import('@tensorflow/tfjs-backend-wasm')
        wasm.setWasmPaths(new URL('runtime/tfjs/', assetsBase).href)
        if (!(await tf.setBackend('wasm'))) throw new Error('WASM is unavailable')
        await tf.ready()
      } catch {
        try {
          if (!(await tf.setBackend('webgl'))) throw new Error('WebGL is unavailable')
        } catch {
          await tf.setBackend('cpu')
        }
        await tf.ready()
      }
      const pitch = new BasicPitch(new URL('models/basic-pitch/model.json', assetsBase).href)
      const model = await pitch.model
      const frames: number[][] = [],
        onsets: number[][] = []
      status('正在识别音符与和弦…', 'Transcribing notes and chords…')
      tf.engine().startScope()
      try {
        const window = 22050 * 2 - 256,
          prefix = 15 * 256,
          hop = window - 30 * 256
        const batches = Math.ceil((samples.length + prefix) / hop)
        const count = Math.floor((samples.length * Math.floor(22050 / 256)) / 22050)
        // The upstream convenience method retains temporary tensors until it
        // finishes; its padding also calls tf.fill without a dtype, unsupported
        // by TFJS 3's WASM backend. Pad in PCM and scope each fixed-size batch.
        for (let batch = 0; batch < batches && frames.length < count; batch++) {
          tf.engine().startScope()
          try {
            const start = batch * hop - prefix
            const first = Math.max(0, start),
              last = Math.min(samples.length, start + window)
            const pcm = new Float32Array(window)
            pcm.set(samples.subarray(first, last), first - start)
            const input = tf.tensor3d(pcm, [1, window, 1], 'float32')
            const [frameTensor, onsetTensor] = await pitch.evaluateSingleFrame(input, 0)
            const f = await pitch.unwrapOutput(frameTensor).array()
            const o = await pitch.unwrapOutput(onsetTensor).array()
            const remaining = count - frames.length
            for (const row of f.slice(0, remaining)) frames.push(row)
            for (const row of o.slice(0, remaining)) onsets.push(row)
          } finally {
            tf.engine().endScope()
          }
          progress(0.1 + ((batch + 1) / batches) * 0.85)
        }
      } finally {
        tf.engine().endScope()
        model.dispose()
      }
      const threshold = 1 - Number(values.sensitivity) / 100
      const notes = noteFramesToTime(
        outputToNotesPoly(
          frames,
          onsets,
          threshold,
          threshold,
          Math.max(1, Math.round(((Number(values.minDuration) / 1000) * 22050) / 256)),
        ),
      )
      if (!notes.length)
        throw new LocalizedError(
          '没有识别到音符。请提高灵敏度或使用清晰的独奏音频。',
          'No notes were detected. Increase sensitivity or use a clear solo recording.',
        )
      const midi = new Midi()
      midi.name = file.name.replace(/\.[^.]+$/, '')
      midi.header.setTempo(120)
      const track = midi.addTrack()
      track.name = 'Transcribed notes'
      for (const note of notes)
        track.addNote({
          midi: note.pitchMidi,
          time: Math.max(0, note.startTimeSeconds),
          duration: note.durationSeconds,
          velocity: Math.max(0.05, Math.min(1, note.amplitude)),
        })
      result = {
        summary: b(
          `已识别 ${notes.length} 个音符并生成 MIDI。识别结果可能需要人工修正。`,
          `Transcribed ${notes.length} notes to MIDI. The result may need manual editing.`,
        ),
        files: [
          { name: outputName(file.name, 'mid'), blob: bytesBlob(midi.toArray(), 'audio/midi') },
        ],
      }
    } else {
      status('正在读取 MIDI 并合成音频…', 'Reading MIDI and synthesizing audio…')
      const midi = parseMidi(new Uint8Array(await file.arrayBuffer()))
      const format = String(values.format ?? 'wav') as MidiAudioFormat
      if (!Object.hasOwn(midiAudioFormats, format)) throw new Error('Invalid audio format')
      const selected = midiAudioFormats[format]
      const rate = ['opus', 'webm'].includes(format) ? 48000 : Number(values.sampleRate)
      const wav = await synthesizeMidi(
        midi,
        rate,
        String(values.instrument),
        new AbortController().signal,
        (value) => progress(value * (format === 'wav' ? 1 : 0.65)),
      )
      let bytes = wav
      if (format !== 'wav') {
        status('正在编码所选音频格式…', 'Encoding the selected audio format…')
        bytes = await encodeMidiAudio(wav, format, Number(values.bitrate ?? 192), rate, (time) =>
          progress(0.65 + Math.min(1, time / (wav.byteLength / (rate * 4))) * 0.34),
        )
      }
      const label = format === 'alac' ? 'M4A / ALAC' : format.toUpperCase()
      result = {
        summary: b(
          `已合成 ${midi.tracks.length} 条音轨，生成 ${rate} Hz 立体声 ${label}。`,
          `Rendered ${midi.tracks.length} tracks to a ${rate} Hz stereo ${label}.`,
        ),
        files: [
          {
            name: outputName(file.name, selected.extension),
            blob: bytesBlob(bytes, selected.mime),
          },
        ],
      }
    }
    progress(1)
    self.postMessage({ type: 'result', value: result })
  } catch (error) {
    if (import.meta.env.DEV) console.error('MIDI conversion failed', error)
    self.postMessage({
      type: 'error',
      value:
        error instanceof LocalizedError
          ? error.messages
          : b(
              'MIDI 转换失败。请检查文件，或刷新后重试。',
              'MIDI conversion failed. Check the file or refresh and try again.',
            ),
    })
  }
}
