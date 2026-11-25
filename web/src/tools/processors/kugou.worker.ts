import {
  bilingual as b,
  errorMessage,
  localize,
  LocalizedError,
  type LocalizedText,
} from '../../lib/locale'
import type { ToolResult, ToolValues } from '../registry'
import { finished, outputName } from './shared'
import { uniqueOutputNames } from './batch'
import { deriveQmcKey, kgmV3Cipher, qmcCipher } from './kugou-crypto'
import { kgmV2Cipher } from './kugou-v2'
import { audioFormat, expectedAudioBytes } from './kugou-audio'

const kgmMagic = new Uint8Array([
  0x7c, 0xd5, 0x32, 0xeb, 0x86, 0x02, 0x7f, 0x4b, 0xa8, 0xaf, 0xa6, 0x8e, 0x0f, 0xff, 0x99, 0x14,
])
const vprMagic = new Uint8Array([
  0x05, 0x28, 0xbc, 0x96, 0xe9, 0xe4, 0x5a, 0x43, 0x91, 0xaa, 0xbd, 0xd0, 0x7a, 0xf5, 0x36, 0x31,
])
const starts = (bytes: Uint8Array, prefix: Uint8Array) =>
  prefix.every((byte, index) => bytes[index] === byte)
const status = (zh: string, en: string) => self.postMessage({ type: 'status', value: b(zh, en) })
const progress = (value: number) => self.postMessage({ type: 'progress', value })
const decoder = new TextDecoder()
const mime: Record<string, string> = {
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
}

async function decrypt(
  file: File,
  keys: Map<string, string>,
  directKey: string,
  update: (value: number) => void,
) {
  const header = new Uint8Array(await file.slice(0, 4096).arrayBuffer())
  const vpr = starts(header, vprMagic)
  if (!vpr && !starts(header, kgmMagic)) {
    const format = audioFormat(header)
    if (!format)
      throw new LocalizedError(
        '未识别到酷狗加密文件头或正常音频头。',
        'No supported Kugou encrypted header or ordinary audio header was found.',
      )
    update(1)
    return {
      name: outputName(file.name.replace(/\.(kgm|kgma|kge|kgg|vpr)(?=\.[^.]+$)/i, ''), format),
      blob: new Blob([file], { type: mime[format] }),
      plain: true,
      version: 0,
      format,
      expectedBytes: format === 'mp3' ? expectedAudioBytes(header) : undefined,
    }
  }
  if (header.length < 0x1c)
    throw new LocalizedError('加密文件头不完整。', 'The encrypted file header is incomplete.')
  const view = new DataView(header.buffer)
  const offset = view.getUint32(0x10, true),
    version = view.getUint32(0x14, true)
  const minimumHeader = version === 2 || version === 4 ? 0x2c : 0x3c
  if (offset < minimumHeader || offset >= file.size)
    throw new LocalizedError('音频数据偏移无效。', 'The audio data offset is invalid.')
  const candidates: Array<(bytes: Uint8Array, offset: number) => void> = []
  if (version === 2 || version === 4) candidates.push(kgmV2Cipher(header, vpr))
  else if (version === 3) {
    if (view.getUint32(0x18, true) === 1 && !vpr) candidates.push(kgmV3Cipher(header))
    candidates.push(kgmV2Cipher(header, vpr))
  } else if (version === 5) {
    if (header.length < 0x48)
      throw new LocalizedError('KGG 文件头不完整。', 'The KGG header is incomplete.')
    const hashLength = view.getUint32(0x44, true)
    if (
      hashLength < 32 ||
      hashLength > 128 ||
      0x48 + hashLength > offset ||
      0x48 + hashLength > header.length
    )
      throw new LocalizedError('KGG 音频标识长度无效。', 'The KGG audio hash length is invalid.')
    const hash = decoder
      .decode(header.subarray(0x48, 0x48 + hashLength))
      .replace(/\0/g, '')
      .trim()
      .toLowerCase()
    if (!/^[a-f\d]{32}$/.test(hash))
      throw new LocalizedError('KGG 音频标识无效。', 'The KGG audio hash is invalid.')
    const key = keys.get(hash) ?? directKey
    if (!key)
      throw new LocalizedError(
        `KGG v5 需要对应密钥。请导入 KGMusicV3.db、mggkey_multi_process 或填写 hash=${hash} 的 ekey。`,
        `KGG v5 requires a matching key. Import KGMusicV3.db, mggkey_multi_process or the ekey for hash=${hash}.`,
      )
    candidates.push(qmcCipher(deriveQmcKey(key)))
  } else
    throw new LocalizedError(
      `暂不支持加密版本 ${version}；当前支持 v2 / v3 / v4 / v5。`,
      `Encryption version ${version} is unsupported; supported versions are v2 / v3 / v4 / v5.`,
    )
  const chunks: ArrayBuffer[] = []
  let format: string | undefined
  let expectedBytes: number | undefined
  let cipher: ((bytes: Uint8Array, offset: number) => void) | undefined
  const length = file.size - offset
  for (let position = 0; position < length; position += 4 * 1024 * 1024) {
    const bytes = new Uint8Array(
      await file
        .slice(offset + position, Math.min(file.size, offset + position + 4 * 1024 * 1024))
        .arrayBuffer(),
    )
    if (!position) {
      for (const candidate of candidates) {
        const probe = bytes.slice()
        candidate(probe, 0)
        format = audioFormat(probe)
        if (format) {
          cipher = candidate
          bytes.set(probe)
          expectedBytes = format === 'mp3' ? expectedAudioBytes(probe) : undefined
          break
        }
      }
      if (!format)
        throw new LocalizedError(
          '解密后无法识别音频格式，密钥可能不匹配或文件已损坏。',
          'The decrypted audio header is unrecognized. The key may not match or the file may be damaged.',
        )
    } else cipher!(bytes, position)
    chunks.push(Uint8Array.from(bytes).buffer)
    update((position + bytes.length) / length)
  }
  const base = file.name.replace(
    /\.(?:kgm|kgma|kgg|kge|vpr)(?:\.(?:flac|mp3|ogg|wav|m4a|aac))?$/i,
    '',
  )
  return {
    name: outputName(`${base}.encrypted`, format!),
    blob: new Blob(chunks, { type: mime[format!] }),
    plain: false,
    version,
    format: format!,
    expectedBytes,
  }
}

self.onmessage = async ({ data }: MessageEvent<{ values: ToolValues }>) => {
  try {
    const values = data.values,
      inputs = values.files as File[]
    const keys = new Map<string, string>()
    const details: LocalizedText[] = []
    const text = String(values.ekey ?? '').trim()
    let directKey = ''
    if (text.startsWith('{') || text.startsWith('[')) {
      const { parseKeyJson } = await import('./kugou-keys')
      for (const [hash, key] of parseKeyJson(text)) keys.set(hash, key)
    } else directKey = text
    for (const file of values.keyFiles as File[]) {
      status(`正在读取本地密钥 · ${file.name}`, `Reading local keys · ${file.name}`)
      try {
        const { loadKeyFile } = await import('./kugou-keys')
        for (const [hash, key] of await loadKeyFile(file)) keys.set(hash, key)
      } catch (error) {
        const message = errorMessage(error)
        details.push(b(localize('zh-CN', message), localize('en', message)))
      }
    }
    const files: NonNullable<ToolResult['files']> = []
    let incomplete = 0
    for (const [index, file] of inputs.entries()) {
      status(
        `${index + 1}/${inputs.length} · 正在解密 ${file.name}`,
        `${index + 1}/${inputs.length} · Decrypting ${file.name}`,
      )
      try {
        const result = await decrypt(file, keys, directKey, (value) =>
          progress((index + value) / inputs.length),
        )
        files.push({ name: result.name, blob: result.blob })
        details.push(
          b(
            `${file.name}：${result.plain ? '普通音频，原样导出' : `v${result.version} 已解出 ${result.format.toUpperCase()}`} → ${result.name}`,
            `${file.name}: ${result.plain ? 'ordinary audio, exported unchanged' : `v${result.version} decoded as ${result.format.toUpperCase()}`} → ${result.name}`,
          ),
        )
        if (result.expectedBytes !== undefined && result.expectedBytes > result.blob.size) {
          incomplete++
          details.push(
            b(
              `${file.name}：警告，音频头记录至少 ${result.expectedBytes} 字节，实际只有 ${result.blob.size} 字节，文件数据不完整。请重新完整下载原文件；当前仅导出已有片段，无法恢复缺失的音频。`,
              `${file.name}: warning, the audio header declares at least ${result.expectedBytes} bytes, but only ${result.blob.size} bytes are present. Download the complete original file again. Only the available fragment is exported; missing audio cannot be recovered.`,
            ),
          )
        }
      } catch (error) {
        const message = errorMessage(error)
        details.push(
          b(
            `${file.name}：失败 · ${localize('zh-CN', message)}`,
            `${file.name}: failed · ${localize('en', message)}`,
          ),
        )
      }
      progress((index + 1) / inputs.length)
    }
    if (!files.length)
      throw new LocalizedError(
        details.map((item) => item['zh-CN']).join('\n'),
        details.map((item) => item.en).join('\n'),
      )
    self.postMessage({
      type: 'result',
      value: {
        ...finished(uniqueOutputNames(files)),
        summary: b(
          `处理结束：${files.length} 个已解出，${inputs.length - files.length} 个失败。${incomplete ? `其中 ${incomplete} 个文件数据不完整。` : ''}`,
          `Finished: ${files.length} decoded, ${inputs.length - files.length} failed.${incomplete ? ` ${incomplete} file(s) are incomplete.` : ''}`,
        ),
        details,
      },
    })
  } catch (error) {
    const message = errorMessage(error)
    self.postMessage({
      type: 'error',
      value: b(localize('zh-CN', message), localize('en', message)),
    })
  }
}
