import { decodeMidiAudio, encodeMidiAudio } from '../../src/tools/processors/midi-codecs'
import type { MidiAudioFormat } from '../../src/tools/processors/midi-formats'

self.onmessage = async ({ data }) => {
  try {
    // Exercise the fallback used on browsers without an Opus WebCodecs encoder.
    Object.defineProperty(globalThis, 'AudioEncoder', { value: undefined, configurable: true })
    const encoded = await encodeMidiAudio(
      new Uint8Array(data.wav),
      data.format as MidiAudioFormat,
      320,
      data.sampleRate,
      () => {},
    )
    const pcm = await decodeMidiAudio(encoded, () => {})
    self.postMessage({
      size: encoded.byteLength,
      samples: pcm.length,
      peak: pcm.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0),
    })
  } catch (error) {
    self.postMessage({ error: String(error) })
  }
}
