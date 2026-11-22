import { LocalizedError } from '../../lib/locale'
import { midiAudioFormats, type MidiAudioFormat } from './midi-formats'
import { getFFmpegCore } from './ffmpeg'

async function convert(
  bytes: Uint8Array,
  output: string,
  args: string[],
  progress: (time: number) => void,
) {
  const core = await getFFmpegCore()
  core.FS.writeFile('input', bytes)
  try {
    // Long MIDI conversions remain cancellable by terminating the owning Worker.
    core.setTimeout(-1)
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
  const pcm = await convert(
    bytes,
    'decoded.f32',
    ['-ac', '1', '-ar', '22050', '-c:a', 'pcm_f32le', '-f', 'f32le'],
    progress,
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
