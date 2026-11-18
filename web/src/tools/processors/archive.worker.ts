import { BlobReader, BlobWriter, Uint8ArrayWriter, ZipReader, ZipWriter } from '@zip.js/zip.js'
import { bilingual as b, LocalizedError } from '../../lib/locale'
import type { ToolValues } from '../registry'
import { outputName } from './shared'
import { passwordPlan } from './passwords'

const limit = 256 * 1024 * 1024
function boundedSink(collect: boolean) {
  let size = 0
  const chunks: Uint8Array<ArrayBuffer>[] = []
  return {
    stream: new WritableStream<Uint8Array>({
      write(chunk) {
        size += chunk.byteLength
        if (size > limit)
          throw new LocalizedError(
            '解压内容超过 256 MiB 限制。',
            'Extracted data exceeds the 256 MiB limit.',
          )
        if (collect) chunks.push(Uint8Array.from(chunk))
      },
    }),
    blob: () => new Blob(chunks),
    size: () => size,
  }
}
self.onmessage = async ({ data }: MessageEvent<{ values: ToolValues }>) => {
  const values = data.values
  const file = (values.files as File[])[0]
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false })
  try {
    self.postMessage({ type: 'status', value: b('正在检查压缩包…', 'Inspecting archive…') })
    const entries = await reader.getEntries()
    const files = entries.filter((entry) => !entry.directory)
    if (!files.length)
      throw new LocalizedError('压缩包中没有文件。', 'The archive contains no files.')
    if (
      entries.length > 1024 ||
      files.reduce((sum, entry) => sum + entry.uncompressedSize, 0) > limit
    )
      throw new LocalizedError(
        '最多处理 1024 个条目，解压后总大小不能超过 256 MiB。',
        'At most 1024 entries and 256 MiB of extracted data are supported.',
      )
    if (entries.some((entry) => /(^\/|^[a-z]:|(^|[\\/])\.\.([\\/]|$))/i.test(entry.filename)))
      throw new LocalizedError(
        '压缩包包含无效文件路径。',
        'The archive contains invalid file paths.',
      )
    const encrypted = files
      .filter((entry) => entry.encrypted)
      .sort((a, z) => a.uncompressedSize - z.uncompressedSize)
    let password: string | undefined
    let attempts = 0
    if (encrypted.length) {
      const plan = passwordPlan(values)
      const sample = encrypted[0]
      const started = performance.now()
      for (const candidate of plan.candidates()) {
        attempts++
        try {
          // The short ZIP header check can collide. Full decompression and CRC/MAC
          // verification are required before accepting a password.
          await sample.getData(new Uint8ArrayWriter(), {
            password: candidate,
            checkPasswordOnly: true,
            useWebWorkers: false,
          })
          await sample.getData(boundedSink(false).stream, {
            password: candidate,
            checkSignature: true,
            useWebWorkers: false,
          })
          password = candidate
          break
        } catch (error) {
          if (error instanceof LocalizedError) throw error
        }
        if (attempts % 20 === 0 || attempts === plan.total) {
          const seconds = Math.max(0.001, (performance.now() - started) / 1000)
          self.postMessage({
            type: 'progress',
            value: Math.min(0.8, (attempts / Math.max(1, plan.total)) * 0.8),
          })
          self.postMessage({
            type: 'status',
            value: b(
              `已尝试 ${attempts} / ${plan.total} 次 · ${(attempts / seconds).toFixed(0)} 次/秒`,
              `${attempts} / ${plan.total} attempts · ${(attempts / seconds).toFixed(0)} / second`,
            ),
          })
        }
      }
      if (password === undefined)
        throw new LocalizedError(
          `已尝试 ${attempts} 个密码，未能恢复。请补充字典或缩小密码范围。`,
          `No password recovered after ${attempts} attempts. Add a dictionary or refine the password range.`,
        )
    }
    const writer = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false })
    let extractedSize = 0
    for (const [index, entry] of entries.entries()) {
      self.postMessage({
        type: 'status',
        value: b(
          `正在验证并移除密码 · ${index + 1} / ${entries.length}`,
          `Verifying and unlocking · ${index + 1} / ${entries.length}`,
        ),
      })
      if (entry.directory) await writer.add(entry.filename, undefined, { directory: true })
      else {
        const sink = boundedSink(true)
        try {
          await entry.getData(sink.stream, { password, checkSignature: true, useWebWorkers: false })
        } catch (error) {
          if (error instanceof LocalizedError) throw error
          throw new LocalizedError(
            '部分文件验证失败，可能使用了不同密码或已损坏。未输出不完整的压缩包。',
            'Some entries failed verification. They may use different passwords or be damaged. No partial archive was exported.',
          )
        }
        extractedSize += sink.size()
        if (extractedSize > limit)
          throw new LocalizedError('解压总大小超过 256 MiB。', 'Extracted data exceeds 256 MiB.')
        await writer.add(entry.filename, new BlobReader(sink.blob()), { level: 0 })
      }
      self.postMessage({ type: 'progress', value: 0.8 + ((index + 1) / entries.length) * 0.19 })
    }
    const blob = await writer.close()
    self.postMessage({ type: 'progress', value: 1 })
    self.postMessage({
      type: 'result',
      value: {
        summary:
          password === undefined
            ? b(
                '原压缩包未加密，已重新打包。',
                'The archive was not encrypted; it has been repacked.',
              )
            : b(
                `密码已恢复：${password}（${attempts} 次尝试）。已生成无密码 ZIP。`,
                `Password recovered: ${password} (${attempts} attempts). An unlocked ZIP is ready.`,
              ),
        files: [{ name: outputName(file.name, 'unlocked.zip'), blob }],
      },
    })
  } catch (error) {
    self.postMessage({
      type: 'error',
      value:
        error instanceof LocalizedError
          ? error.messages
          : b(
              '无法读取 ZIP，文件可能损坏或使用了暂不支持的加密方式。',
              'Cannot read this ZIP. It may be damaged or use unsupported encryption.',
            ),
    })
  } finally {
    await reader.close()
  }
}
