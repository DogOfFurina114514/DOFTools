import { describe, expect, it } from 'vitest'
import { Midi } from '@tonejs/midi'
import { parseMidi, synthesizeMidi } from './midi-synth'

describe('MIDI timing and local synthesis', () => {
  it('preserves tempo changes, sustain, stereo pan and produces actual PCM samples', async () => {
    const source = new Midi()
    source.header.tempos = [
      { ticks: 0, bpm: 120 },
      { ticks: 480, bpm: 60 },
    ]
    source.header.update()
    const track = source.addTrack()
    track.addNote({ midi: 69, ticks: 0, durationTicks: 240, velocity: 0.8 })
    track.addNote({ midi: 72, ticks: 480, durationTicks: 480, velocity: 0.5 })
    track.addCC({ number: 64, time: 0, value: 1 }).addCC({ number: 64, time: 0.8, value: 0 })
    track.addCC({ number: 10, time: 0, value: 0 })
    const midi = parseMidi(source.toArray())
    expect(midi.tracks[0].notes[1].time).toBeCloseTo(0.5)
    expect(midi.tracks[0].notes[1].duration).toBeCloseTo(1)
    const bytes = await synthesizeMidi(midi, 22050, 'sine', new AbortController().signal, () => {})
    const view = new DataView(bytes.buffer)
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('RIFF')
    expect(view.getUint32(24, true)).toBe(22050)
    expect(view.getUint16(22, true)).toBe(2)
    let left = 0,
      right = 0,
      sustain = 0
    for (let i = 44; i < bytes.length; i += 4) {
      left += Math.abs(view.getInt16(i, true))
      right += Math.abs(view.getInt16(i + 2, true))
    }
    for (let i = Math.floor(0.35 * 22050); i < Math.floor(0.45 * 22050); i++)
      sustain += Math.abs(view.getInt16(44 + i * 4, true))
    expect(left).toBeGreaterThan(100000)
    expect(right).toBe(0)
    expect(sustain).toBeGreaterThan(10000)
  })
  it('rejects malformed, unsupported and empty MIDI and honors cancellation', async () => {
    expect(() => parseMidi(new Uint8Array(30))).toThrow('有效')
    expect(() => parseMidi(new Midi().toArray())).toThrow('没有')
    const midi = new Midi()
    midi.addTrack().addNote({ midi: 60, time: 0, duration: 1 })
    const unsupported = midi.toArray()
    unsupported[8] = 0
    unsupported[9] = 2
    expect(() => parseMidi(unsupported)).toThrow('格式 2')
    const controller = new AbortController()
    controller.abort()
    await expect(synthesizeMidi(midi, 22050, 'sine', controller.signal, () => {})).rejects.toThrow()
  })
  it('retains a pedal release beyond the final note', async () => {
    const source = new Midi()
    const track = source.addTrack().addNote({ midi: 69, time: 0, duration: 0.2 })
    track.addCC({ number: 64, time: 0, value: 1 }).addCC({ number: 64, time: 2, value: 0 })
    const bytes = await synthesizeMidi(
      parseMidi(source.toArray()),
      22050,
      'sine',
      new AbortController().signal,
      () => {},
    )
    expect((bytes.length - 44) / 4 / 22050).toBeCloseTo(2.8)
    expect(new DataView(bytes.buffer).getInt16(44 + 33080 * 4, true)).not.toBe(0)
  })
})
