// Database/MMKV extraction ported from Aaron-gx/KGG-Decryptor (MIT).
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { LocalizedError } from '../../lib/locale'
import { md5 } from './kugou-crypto'

const encoder = new TextEncoder(), decoder = new TextDecoder()
const sqliteHeader = encoder.encode('SQLite format 3\0')
const masterKey = new Uint8Array([0x1d,0x61,0x31,0x45,0xb2,0x47,0xbf,0x7f,0x3d,0x18,0x96,0x72,0x14,0x4f,0xe4,0xbf,0,0,0,0,0x73,0x41,0x6c,0x54])
const startsSqlite = (bytes: Uint8Array) => sqliteHeader.every((byte, i) => bytes[i] === byte)

async function decryptPage(bytes: Uint8Array, page: number) {
  const material = masterKey.slice()
  new DataView(material.buffer).setUint32(16, page, true)
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(md5(material)).buffer, 'AES-CBC', false, ['encrypt', 'decrypt'])
  const ivMaterial = new Uint8Array(16), view = new DataView(ivMaterial.buffer)
  let seed = page + 1
  for (let i = 0; i < 4; i++) {
    seed = (Math.imul(seed, 0x9ef4) - Math.imul(Math.floor(seed / 0xce26), 0x7fffff07)) >>> 0
    if (seed & 0x80000000) seed = (seed + 0x7fffff07) >>> 0
    view.setUint32(i * 4, seed, true)
  }
  // WebCrypto enforces PKCS7. Append a synthesized padding block to decrypt
  // the original SQLite NoPadding ciphertext without losing its final block.
  const padding = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: Uint8Array.from(bytes.subarray(-16)).buffer }, key, new Uint8Array(0)))
  const input = new Uint8Array(bytes.length + padding.length)
  input.set(bytes); input.set(padding, bytes.length)
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: Uint8Array.from(md5(ivMaterial)).buffer }, key, input.buffer))
}

async function decryptDatabase(bytes: Uint8Array) {
  if (startsSqlite(bytes)) return bytes
  if (bytes.length < 1024 || bytes.length % 1024) throw new Error('Invalid database length')
  const result = bytes.slice(), header = new DataView(result.buffer)
  const pageSize = header.getUint16(16)
  if (pageSize !== 1024 || header.getUint32(20, true) !== 0x20204000) throw new Error('Unsupported encrypted database header')
  result.copyWithin(16, 8, 16)
  result.set(await decryptPage(result.subarray(16, 1024), 1), 16)
  result.set(sqliteHeader)
  for (let page = 2; page <= result.length / 1024; page++) {
    const offset = (page - 1) * 1024
    result.set(await decryptPage(result.subarray(offset, offset + 1024), page), offset)
  }
  return result
}

function addKey(map: Map<string, string>, hash: unknown, value: unknown) {
  if (typeof hash !== 'string' || typeof value !== 'string') return
  const id = hash.replace(/\0/g, '').trim().toLowerCase()
  const key = value.replace(/[\s\0]/g, '')
  if (/^[a-f\d]{32}$/.test(id) && key.length > 16 && key.length < 32768 && /^[A-Za-z\d+/]+=*$/.test(key)) map.set(id, key)
}

export function parseKeyJson(text: string) {
  const data: unknown = JSON.parse(text)
  const keys = new Map<string, string>()
  if (Array.isArray(data)) for (const row of data) {
    if (row && typeof row === 'object') {
      const item = row as Record<string, unknown>
      addKey(keys, item.EncryptionKeyId ?? item.hash, item.EncryptionKey ?? item.ekey)
    }
  }
  else if (data && typeof data === 'object') for (const [hash, key] of Object.entries(data)) addKey(keys, hash, key)
  if (!keys.size) throw new LocalizedError('JSON 中没有有效的 hash → ekey 密钥。', 'The JSON contains no valid hash → ekey entries.')
  return keys
}

function varint(bytes: Uint8Array, at: number): [number, number] | undefined {
  let value = 0
  for (let shift = 0; shift <= 28 && at < bytes.length; shift += 7) {
    const byte = bytes[at++]
    value += (byte & 127) * 2 ** shift
    if (!(byte & 128)) return [value, at]
  }
}

function parseMmkv(bytes: Uint8Array) {
  const keys = new Map<string, string>()
  for (let i = 0; i + 32 <= bytes.length; i++) {
    let hexadecimal = true
    for (let j = i; j < i + 32; j++) {
      const value = bytes[j]
      if (!((value >= 48 && value <= 57) || (value >= 65 && value <= 70) || (value >= 97 && value <= 102))) { hexadecimal = false; break }
    }
    if (!hexadecimal) continue
    const hash = decoder.decode(bytes.subarray(i, i + 32))
    if (!/^[a-f\d]{32}$/i.test(hash)) continue
    const item = varint(bytes, i + 32)
    const value = item && varint(bytes, item[1])
    if (!value || value[0] < 17 || value[0] > 32768 || value[1] + value[0] > bytes.length) continue
    const keyText = decoder.decode(bytes.subarray(value[1], value[1] + value[0]))
    addKey(keys, hash, keyText)
    if (keys.has(hash.toLowerCase())) i = value[1] + value[0] - 1
  }
  if (!keys.size) throw new Error('No MMKV keys found')
  return keys
}

export async function loadKeyFile(file: File) {
  if (!file.size || file.size > 64 * 1024 * 1024) throw new LocalizedError('单份密钥文件须非空且不超过 64 MiB。', 'Each key file must be nonempty and at most 64 MiB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (/\.json$/i.test(file.name)) return parseKeyJson(decoder.decode(bytes))
  try {
    if (/\.db$/i.test(file.name) || startsSqlite(bytes)) {
      const plain = await decryptDatabase(bytes)
      const SQL = await initSqlJs({ locateFile: () => wasmUrl, useOldExtensionFunctions: false })
      const db = new SQL.Database(plain)
      try {
        const result = db.exec("SELECT EncryptionKeyId, EncryptionKey FROM ShareFileItems WHERE EncryptionKey IS NOT NULL AND EncryptionKey != ''")
        const keys = new Map<string, string>()
        for (const table of result) for (const [hash, key] of table.values) addKey(keys, hash, key)
        if (!keys.size) throw new Error('No database keys found')
        return keys
      } finally { db.close() }
    }
    return parseMmkv(bytes)
  } catch {
    throw new LocalizedError(`无法从 ${file.name} 读取密钥，请使用 KGMusicV3.db、mggkey_multi_process 或 hash → ekey JSON。`, `Cannot read keys from ${file.name}. Use KGMusicV3.db, mggkey_multi_process or hash → ekey JSON.`)
  }
}
