const decoder = new TextDecoder()

function id3End(bytes: Uint8Array) {
  if (decoder.decode(bytes.subarray(0, 3)) !== 'ID3') return 0
  if (
    bytes.length < 10 ||
    bytes[3] < 2 ||
    bytes[3] > 4 ||
    bytes.subarray(6, 10).some((byte) => byte > 127)
  )
    return undefined
  const size = bytes[6] * 0x200000 + bytes[7] * 0x4000 + bytes[8] * 128 + bytes[9]
  return 10 + size + (bytes[3] === 4 && bytes[5] & 16 ? 10 : 0)
}

function mpegFrame(bytes: Uint8Array, offset: number) {
  if (offset + 4 > bytes.length) return false
  const b = bytes.subarray(offset, offset + 4)
  return (
    b[0] === 255 &&
    (b[1] & 0xe0) === 0xe0 &&
    (b[1] & 6) !== 0 &&
    (b[1] & 0x18) !== 8 &&
    (b[2] & 0xf0) !== 0xf0 &&
    (b[2] & 12) !== 12
  )
}

export function audioFormat(bytes: Uint8Array): string | undefined {
  if (bytes.length < 12) return undefined
  const tagEnd = id3End(bytes)
  if (tagEnd === undefined) return undefined
  const offset = tagEnd < bytes.length ? tagEnd : 0
  const audio = bytes.subarray(offset),
    head = decoder.decode(audio.subarray(0, 12))
  if (head.startsWith('fLaC') && audio.length >= 42 && (audio[4] & 127) === 0) return 'flac'
  if (head.startsWith('OggS') && audio.length >= 27) return 'ogg'
  if (head.startsWith('RIFF') && head.slice(8) === 'WAVE') return 'wav'
  if (head.slice(4, 8) === 'ftyp') return 'm4a'
  if (audio[0] === 255 && (audio[1] & 0xf6) === 0xf0) return 'aac'
  if (mpegFrame(bytes, offset)) return 'mp3'
  // A large ID3 tag can extend beyond the initial probe; inspect its audio later.
  if (tagEnd >= bytes.length) return 'mp3'
  return undefined
}

/** A Xing/Info/VBRI byte count provides a lower bound even when ID3 is retained. */
export function expectedAudioBytes(bytes: Uint8Array): number | undefined {
  const offset = id3End(bytes)
  if (offset === undefined || !mpegFrame(bytes, offset)) return undefined
  const version = (bytes[offset + 1] >>> 3) & 3
  const layer = (bytes[offset + 1] >>> 1) & 3
  if (layer !== 1) return undefined
  const mono = bytes[offset + 3] >>> 6 === 3
  const sideInfo = version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17
  const crc = bytes[offset + 1] & 1 ? 0 : 2
  const at = offset + 4 + crc + sideInfo
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (at + 12 <= bytes.length) {
    const tag = decoder.decode(bytes.subarray(at, at + 4))
    if (tag === 'Xing' || tag === 'Info') {
      const flags = view.getUint32(at + 4)
      const sizeAt = at + 8 + (flags & 1 ? 4 : 0)
      if (flags & 2 && sizeAt + 4 <= bytes.length) {
        const size = view.getUint32(sizeAt)
        if (size > 0) return size
      }
    }
  }
  const vbri = offset + 36
  if (vbri + 14 <= bytes.length && decoder.decode(bytes.subarray(vbri, vbri + 4)) === 'VBRI') {
    const size = view.getUint32(vbri + 10)
    if (size > 0) return size
  }
  return undefined
}
