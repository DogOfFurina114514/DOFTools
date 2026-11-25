import { describe, expect, it } from 'vitest'
import { audioFormat, expectedAudioBytes } from './kugou-audio'

function mp3Header(tag: 'Xing' | 'Info', flags = 3) {
  const bytes = new Uint8Array(128)
  bytes.set([0xff, 0xfb, 0x90, 0x00])
  bytes.set(new TextEncoder().encode(tag), 36)
  const view = new DataView(bytes.buffer)
  view.setUint32(40, flags)
  if (flags & 1) view.setUint32(44, 10000)
  if (flags & 2) view.setUint32(flags & 1 ? 48 : 44, 4293275)
  return bytes
}

describe('Kugou audio inspection', () => {
  it.each(['Xing', 'Info'] as const)('reads the declared byte count from %s MPEG frames', (tag) => {
    const bytes = mp3Header(tag)
    expect(audioFormat(bytes)).toBe('mp3')
    expect(expectedAudioBytes(bytes)).toBe(4293275)
    expect(expectedAudioBytes(mp3Header(tag, 2))).toBe(4293275)
    expect(expectedAudioBytes(mp3Header(tag, 1))).toBeUndefined()
  })

  it('skips ID3 tags and identifies the audio rather than treating every ID3 file as MP3', () => {
    const bytes = new Uint8Array(90)
    bytes.set([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 16])
    bytes.set(new TextEncoder().encode('fLaC'), 26)
    bytes[33] = 34
    expect(audioFormat(bytes)).toBe('flac')
    expect(expectedAudioBytes(bytes)).toBeUndefined()
  })

  it('reads MP3 length metadata after ID3 and from sliced buffers', () => {
    const bytes = new Uint8Array(160)
    bytes.set([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 16], 3)
    bytes.set(mp3Header('Info'), 29)
    expect(audioFormat(bytes.subarray(3))).toBe('mp3')
    expect(expectedAudioBytes(bytes.subarray(3))).toBe(4293275)
  })

  it('rejects damaged ID3 headers and does not trust stray Info text', () => {
    const damaged = new Uint8Array(128)
    damaged.set([0x49, 0x44, 0x33, 3, 0, 0, 128, 0, 0, 0])
    expect(audioFormat(damaged)).toBeUndefined()
    const stray = new Uint8Array(128)
    stray.set(new TextEncoder().encode('Info'), 36)
    expect(expectedAudioBytes(stray)).toBeUndefined()
  })
})
