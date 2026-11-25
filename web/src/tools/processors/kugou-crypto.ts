// KGM v3 and QMC key/cipher ports: Aaron-gx/KGG-Decryptor (MIT).
// See documentation/third-party/KUGOU-SOURCES.md and the bundled licenses.
import { LocalizedError } from '../../lib/locale'

export function md5(bytes: Uint8Array): Uint8Array {
  const length = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(length)
  padded.set(bytes)
  padded[bytes.length] = 128
  const view = new DataView(padded.buffer)
  view.setUint32(length - 8, (bytes.length * 8) >>> 0, true)
  view.setUint32(length - 4, Math.floor(bytes.length / 0x20000000), true)
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  for (let offset = 0; offset < length; offset += 64) {
    let a = a0, b = b0, c = c0, d = d0
    for (let i = 0; i < 64; i++) {
      const round = i >>> 4
      const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) : round === 2 ? b ^ c ^ d : c ^ (b | ~d)
      const g = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16
      const sum = (a + f + Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) + view.getUint32(offset + g * 4, true)) >>> 0
      const shift = shifts[round * 4 + i % 4]
      const next = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0
      a = d; d = c; c = b; b = next
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0
  }
  const result = new Uint8Array(16)
  const output = new DataView(result.buffer)
  ;[a0, b0, c0, d0].forEach((word, i) => output.setUint32(i * 4, word, true))
  return result
}

function kugouMd5(input: Uint8Array) {
  const digest = md5(input)
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i += 2) { out[i] = digest[14 - i]; out[i + 1] = digest[15 - i] }
  return out
}

export function kgmV3Cipher(header: Uint8Array) {
  const slot = kugouMd5(new Uint8Array([0x6c, 0x2c, 0x2f, 0x27]))
  const key = new Uint8Array(17)
  key.set(kugouMd5(header.subarray(0x2c, 0x3c)))
  key[16] = 0x6b
  return (bytes: Uint8Array, offset: number) => {
    for (let j = 0; j < bytes.length; j++) {
      const i = offset + j
      const value = bytes[j] ^ key[i % 17]
      bytes[j] = value ^ (value << 4) ^ slot[i % 16] ^ i ^ (i >>> 8) ^ (i >>> 16) ^ (i >>> 24)
    }
  }
}

function teaBlock(block: Uint8Array, key: Uint8Array) {
  const input = new DataView(block.buffer, block.byteOffset, 8)
  const keys = new DataView(key.buffer, key.byteOffset, 16)
  let v0 = input.getUint32(0), v1 = input.getUint32(4), sum = Math.imul(0x9e3779b9, 16) >>> 0
  const k = [0, 4, 8, 12].map((i) => keys.getUint32(i))
  for (let i = 0; i < 16; i++) {
    v1 = (v1 - (((v0 << 4) + k[2]) ^ (v0 + sum) ^ ((v0 >>> 5) + k[3]))) >>> 0
    v0 = (v0 - (((v1 << 4) + k[0]) ^ (v1 + sum) ^ ((v1 >>> 5) + k[1]))) >>> 0
    sum = (sum - 0x9e3779b9) >>> 0
  }
  const out = new Uint8Array(8), view = new DataView(out.buffer)
  view.setUint32(0, v0); view.setUint32(4, v1)
  return out
}

function invalidKey(): never {
  throw new LocalizedError('密钥无效或与文件不匹配。', 'The key is invalid or does not match the file.')
}

function tencentTea(input: Uint8Array, key: Uint8Array) {
  if (input.length < 16 || input.length % 8 || key.length !== 16) invalidKey()
  const plain = new Uint8Array(input.length)
  let intermediate = teaBlock(input.subarray(0, 8), key)
  plain.set(intermediate)
  for (let offset = 8; offset < input.length; offset += 8) {
    const block = input.subarray(offset, offset + 8)
    for (let j = 0; j < 8; j++) intermediate[j] ^= block[j]
    intermediate = teaBlock(intermediate, key)
    for (let j = 0; j < 8; j++) plain[offset + j] = intermediate[j] ^ input[offset - 8 + j]
  }
  const start = 1 + (plain[0] & 7) + 2
  const end = plain.length - 7
  if (start > end || plain.subarray(end).some((byte) => byte !== 0)) invalidKey()
  return plain.slice(start, end)
}

function decode64(value: string) {
  try { return Uint8Array.from(atob(value.replace(/[\s\0]/g, '')), (char) => char.charCodeAt(0)) }
  catch { return invalidKey() }
}

export function deriveQmcKey(ekey: string) {
  let raw = decode64(ekey)
  const encode = new TextEncoder()
  const prefix = encode.encode('QQMusic EncV2,Key:')
  if (prefix.every((byte, i) => raw[i] === byte)) {
    raw = tencentTea(raw.subarray(prefix.length), encode.encode('386ZJY!@#*$%^&)('))
    raw = tencentTea(raw, encode.encode('**#!(#$%&^a1cZ,T'))
    raw = decode64(new TextDecoder().decode(raw))
  }
  if (raw.length < 24) invalidKey()
  const tea = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    tea[i * 2] = Math.min(255, Math.floor(Math.abs(Math.tan(106 + i * 0.1)) * 100))
    tea[i * 2 + 1] = raw[i]
  }
  const tail = tencentTea(raw.subarray(8), tea)
  const key = new Uint8Array(8 + tail.length)
  key.set(raw.subarray(0, 8)); key.set(tail, 8)
  return key
}

export function qmcCipher(key: Uint8Array) {
  const n = key.length
  if (!n) invalidKey()
  if (n <= 300) return (bytes: Uint8Array, offset: number) => {
    for (let i = 0; i < bytes.length; i++) {
      let pos = offset + i
      if (pos > 0x7fff) pos %= 0x7fff
      const index = (pos * pos + 71214) % n
      const shift = ((index & 7) + 4) % 8
      bytes[i] ^= (key[index] << shift) | (key[index] >>> shift)
    }
  }
  const box = Uint8Array.from({ length: n }, (_, i) => i & 255)
  let j = 0, hash = 1
  for (let i = 0; i < n; i++) { j = (j + box[i] + key[i]) % n; [box[i], box[j]] = [box[j], box[i]] }
  for (const value of key) {
    if (!value) continue
    const next = Math.imul(hash, value) >>> 0
    if (next === 0 || next <= hash) break
    hash = next
  }
  const skip = (id: number) => {
    const denom = (id + 1) * key[id % n]
    return denom ? Math.floor(hash / denom * 100) % n : 0
  }
  return (bytes: Uint8Array, offset: number) => {
    let cursor = 0
    while (offset + cursor < 128 && cursor < bytes.length) {
      bytes[cursor] ^= key[skip(offset + cursor)]; cursor++
    }
    while (cursor < bytes.length) {
      const pos = offset + cursor
      const length = Math.min(bytes.length - cursor, 5120 - pos % 5120)
      const state = box.slice()
      let x = 0, y = 0
      const discard = pos % 5120 + skip(Math.floor(pos / 5120))
      for (let i = -discard; i < length; i++) {
        x = (x + 1) % n; y = (state[x] + y) % n
        ;[state[x], state[y]] = [state[y], state[x]]
        if (i >= 0) bytes[cursor + i] ^= state[(state[x] + state[y]) % n]
      }
      cursor += length
    }
  }
}
