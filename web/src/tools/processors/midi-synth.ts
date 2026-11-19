import { Midi, type Track } from '@tonejs/midi'
import { LocalizedError } from '../../lib/locale'
import { pause } from './shared'

export function parseMidi(bytes: Uint8Array) {
  if (bytes.length < 14 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'MThd')
    throw new LocalizedError('这不是有效的 MIDI 文件。', 'This is not a valid MIDI file.')
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (header.getUint16(8) > 1 || header.getUint16(12) & 0x8000)
    throw new LocalizedError(
      '暂不支持 MIDI 格式 2 或 SMPTE 时间格式。',
      'MIDI format 2 and SMPTE time division are not supported.',
    )
  let midi: Midi
  try {
    midi = new Midi(bytes)
  } catch {
    throw new LocalizedError(
      'MIDI 文件损坏或格式不受支持。',
      'The MIDI file is damaged or unsupported.',
    )
  }
  const count = midi.tracks.reduce((sum, track) => sum + track.notes.length, 0)
  if (!count)
    throw new LocalizedError('MIDI 中没有可合成的音符。', 'This MIDI contains no playable notes.')
  if (count > 10000 || midi.tracks.length > 128)
    throw new LocalizedError(
      '最多支持 10000 个音符和 128 条音轨。',
      'At most 10,000 notes and 128 tracks are supported.',
    )
  if (
    !Number.isFinite(midi.duration) ||
    renderedDuration(midi) > 180 ||
    midi.tracks.some((track) =>
      track.notes.some(
        (note) => !Number.isFinite(note.time + note.duration) || note.time < 0 || note.duration < 0,
      ),
    )
  )
    throw new LocalizedError(
      'MIDI 时长无效或超过 3 分钟。',
      'The MIDI duration is invalid or exceeds 3 minutes.',
    )
  return midi
}

export function encodeWav(left: Float32Array, right: Float32Array, rate: number) {
  const bytes = new Uint8Array(44 + left.length * 4)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) =>
    [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 2, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, left.length * 4, true)
  let peak = 1
  for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
  for (let i = 0; i < left.length; i++) {
    view.setInt16(44 + i * 4, Math.round((left[i] / peak) * 30000), true)
    view.setInt16(46 + i * 4, Math.round((right[i] / peak) * 30000), true)
  }
  return bytes
}

function valueAt(events: { time: number; value: number }[], time: number, fallback: number) {
  let low = 0,
    high = events.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (events[middle].time <= time) low = middle + 1
    else high = middle
  }
  return low ? events[low - 1].value : fallback
}

function sustainedEnd(track: Track, end: number) {
  const pedal = track.controlChanges[64] ?? []
  if (valueAt(pedal, end, 0) < 0.5) return end
  return (
    pedal.find((event) => event.time >= end && event.value < 0.5)?.time ??
    Math.max(end, track.duration)
  )
}

function renderedDuration(midi: Midi) {
  let duration = midi.duration
  for (const track of midi.tracks)
    for (const note of track.notes)
      duration = Math.max(duration, sustainedEnd(track, note.time + note.duration))
  return duration
}

function timbre(program: number, choice: string) {
  if (choice !== 'original') return choice
  if (program < 24 || program >= 112) return 'piano'
  if (program >= 40 && program < 56) return 'strings'
  return program >= 72 && program < 80 ? 'sine' : 'harmonic'
}

export async function synthesizeMidi(
  midi: Midi,
  rate: number,
  choice: string,
  signal: AbortSignal,
  progress: (value: number) => void,
) {
  const length = Math.ceil((renderedDuration(midi) + 0.8) * rate)
  const left = new Float32Array(length),
    right = new Float32Array(length)
  const count = midi.tracks.reduce((sum, track) => sum + track.notes.length, 0)
  let done = 0
  for (const track of midi.tracks) {
    const sound = timbre(track.instrument.number, choice)
    const bends = track.pitchBends,
      volumes = track.controlChanges[7] ?? [],
      expressions = track.controlChanges[11] ?? [],
      pans = track.controlChanges[10] ?? []
    for (const note of track.notes) {
      signal.throwIfAborted()
      const drum = track.channel === 9
      const start = Math.round(note.time * rate)
      const held = Math.max(0.01, sustainedEnd(track, note.time + note.duration) - note.time)
      const release = drum ? 0.1 : sound === 'strings' ? 0.35 : 0.18
      const end = Math.min(length, start + Math.ceil((held + release) * rate))
      const frequency = 440 * 2 ** ((note.midi - 69) / 12)
      let phase = 0,
        bendIndex = 0,
        bend = 0,
        gain = 0,
        panLeft = 0.707,
        panRight = 0.707
      while (bendIndex < bends.length && bends[bendIndex].time <= note.time)
        bend = bends[bendIndex++].value
      for (let i = start; i < end; i++) {
        const time = (i - start) / rate,
          absolute = i / rate
        while (bendIndex < bends.length && bends[bendIndex].time <= absolute)
          bend = bends[bendIndex++].value
        const hz = frequency * 2 ** ((bend * 2) / 12)
        if (i === start || (i - start) % 128 === 0) {
          gain =
            note.velocity * valueAt(volumes, absolute, 1) * valueAt(expressions, absolute, 1) * 0.25
          const pan = valueAt(pans, absolute, 0.5)
          panLeft = Math.cos((pan * Math.PI) / 2)
          panRight = Math.sin((pan * Math.PI) / 2)
        }
        phase += (Math.PI * 2 * hz) / rate
        let wave = Math.sin(phase)
        if (drum) {
          // A deterministic noise component gives percussion a repeatable sound.
          const noise = Math.sin(i * 78.233 + note.midi * 12.9898) * 43758.5453
          wave =
            note.midi <= 36
              ? Math.sin(time * 2 * Math.PI * (50 + 100 * Math.exp(-time * 30)))
              : (noise - Math.floor(noise)) * 2 - 1
        } else if (sound !== 'sine') {
          for (let harmonic = 2; harmonic <= 6; harmonic++) {
            if (hz * harmonic >= rate / 2) break
            wave +=
              (Math.sin(phase * harmonic) / harmonic ** (sound === 'strings' ? 1.4 : 2)) *
              (sound === 'piano' ? Math.exp(-time * harmonic * 1.3) : 1)
          }
        }
        const attack = Math.min(1, time / (sound === 'strings' ? 0.07 : 0.006))
        const tail = time <= held ? 1 : Math.max(0, 1 - (time - held) / release)
        const decay = drum ? Math.exp(-time * 18) : sound === 'piano' ? Math.exp(-time * 1.6) : 1
        const sample = wave * gain * attack * tail * decay
        left[i] += sample * panLeft
        right[i] += sample * panRight
      }
      progress(++done / count)
      if (done % 8 === 0) await pause(signal)
    }
  }
  return encodeWav(left, right, rate)
}
