import { LocalizedError } from '../../lib/locale'
import { midiAudioFormats, type MidiAudioFormat } from './midi-formats'

interface FFmpegCore {
  FS: {
    writeFile: (path: string, data: Uint8Array) => void
    readFile: (path: string) => Uint8Array
    unlink: (path: string) => void
  }
  exec: (...args: string[]) => number
  reset: () => void
  setTimeout: (milliseconds: number) => void
  setProgress: (callback: (event: { time: number }) => void) => void
}

// Load the unmodified, single-thread runtime from this site inside the existing
// cancellable worker. It requires neither a server nor cross-origin isolation.
let corePromise: Promise<FFmpegCore> | undefined
async function getCore() {
  if (!corePromise) {
    const base = new URL(`${import.meta.env.BASE_URL}runtime/ffmpeg/`, self.location.href)
    const script = new URL('ffmpeg-core.js', base).href
    corePromise = import(/* @vite-ignore */ script).then(({ default: createCore }) =>
      createCore({
        mainScriptUrlOrBlob: `${script}#${btoa(JSON.stringify({ wasmURL: new URL('ffmpeg-core.wasm', base).href }))}`,
      }),
    )
  }
  return corePromise
}

async function convert(
  bytes: Uint8Array,
  output: string,
  args: string[],
  progress: (time: number) => void,
) {
  const core = await getCore()
  core.FS.writeFile('input', bytes)
  try {
    core.setTimeout(120000)
    core.setProgress(({ time }) => progress(time / 1_000_000))
    if (
      core.exec(
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'input',
        '-map',
        '0:a:0',
        '-vn',
        ...args,
        output,
      ) !== 0
    )
      throw new LocalizedError(
        '音频编解码失败，请检查文件是否损坏或加密。',
        'Audio decoding or encoding failed. Check whether the file is damaged or encrypted.',
      )
    const data = new Uint8Array(core.FS.readFile(output))
    if (!data.byteLength) throw new Error('Empty audio output')
    return data
  } finally {
    core.reset()
    for (const path of ['input', output]) {
      try {
        core.FS.unlink(path)
      } catch {
        /* The output may not exist after a failed conversion. */
      }
    }
  }
}

export async function decodeMidiAudio(bytes: Uint8Array, progress: (time: number) => void) {
  // Bound output before decoding: even an hours-long compressed upload cannot
  // allocate hours of PCM. The extra second detects the duration limit.
  const pcm = await convert(
    bytes,
    'decoded.f32',
    ['-t', '181', '-ac', '1', '-ar', '22050', '-c:a', 'pcm_f32le', '-f', 'f32le'],
    progress,
  )
  if (pcm.byteLength > 180 * 22050 * 4)
    throw new LocalizedError(
      '音频转 MIDI 最长支持 3 分钟，请先截取片段。',
      'Audio to MIDI supports up to 3 minutes. Trim the audio first.',
    )
  return new Float32Array(pcm.buffer)
}

export async function encodeMidiAudio(
  wav: Uint8Array,
  format: MidiAudioFormat,
  bitrate: number,
  sampleRate: number,
  progress: (time: number) => void,
) {
  const selected = midiAudioFormats[format]
  if (format === 'opus' || format === 'webm') {
    const {
      Input,
      BlobSource,
      ALL_FORMATS,
      BufferTarget,
      Output,
      Conversion,
      OggOutputFormat,
      WebMOutputFormat,
    } = await import('mediabunny')
    const input = new Input({
      source: new BlobSource(new Blob([new Uint8Array(wav).buffer])),
      formats: ALL_FORMATS,
    })
    try {
      const target = new BufferTarget()
      const conversion = await Conversion.init({
        input,
        output: new Output({
          target,
          format: format === 'opus' ? new OggOutputFormat() : new WebMOutputFormat(),
        }),
        video: { discard: true },
        audio: { codec: 'opus', bitrate: bitrate * 1000 },
        showWarnings: false,
      })
      if (conversion.isValid) {
        conversion.onProgress = (_, time) => progress(time)
        await conversion.execute()
        if (target.buffer?.byteLength) return new Uint8Array(target.buffer)
      }
    } catch {
      // Older browsers can use the independent WASM encoder below.
    } finally {
      input.dispose()
    }
  }
  const lossless = ['wav', 'flac', 'aiff', 'alac'].includes(format)
  // The upstream single-thread libopus build traps on some inputs; use FFmpeg's
  // native encoder for the WebCodecs fallback instead.
  const opus = format === 'opus' || format === 'webm'
  const args = ['-c:a', opus ? 'opus' : selected.codec, '-ar', String(sampleRate)]
  if (opus) args.push('-strict', '-2')
  if (!lossless)
    args.push(
      '-b:a',
      `${format === 'ogg' && sampleRate === 22050 ? Math.min(bitrate, 128) : bitrate}k`,
    )
  if (format === 'm4a' || format === 'alac') args.push('-movflags', '+faststart')
  return convert(wav, `output.${selected.extension}`, args, progress)
}
