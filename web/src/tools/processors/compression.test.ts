import { describe, expect, it } from 'vitest'
import { ToolRegistry } from '../registry'
import { builtinTools } from '../builtins'
import { compressionSummary, targetBytes, targetVideoBitrates } from './compression'

describe('compression budgets', () => {
  it('converts fractional KiB / MiB to a whole byte ceiling', () => {
    expect(targetBytes({ targetSize: 1.5, sizeUnit: 'kib' }, 100)).toBe(1536)
    expect(targetBytes({ targetSize: 0.1, sizeUnit: 'mib' }, 100)).toBe(104857)
    for (const values of [
      { targetSize: 0, sizeUnit: 'kib' },
      { targetSize: NaN, sizeUnit: 'mib' },
      { targetSize: 101, sizeUnit: 'mib' },
      { targetSize: 1, sizeUnit: 'mb' },
    ])
      expect(() => targetBytes(values, 100)).toThrow()
  })
  it('reserves container bytes and allocates less bitrate for longer videos', () => {
    const bytes = 1024 * 1024
    const short = targetVideoBitrates(bytes, 10, true)
    const long = targetVideoBitrates(bytes, 60, true)
    expect(short.video).toBeGreaterThan(long.video)
    expect(short.audio).toBeGreaterThanOrEqual(16000)
    expect(((long.video + long.audio) * 60) / 8 + 4096).toBeLessThanOrEqual(bytes * 0.94)
    const silent = targetVideoBitrates(bytes, 60, false)
    expect(silent.audio).toBe(0)
    expect(silent.video).toBeGreaterThan(long.video)
    for (const duration of [0, -1, Infinity, NaN])
      expect(() => targetVideoBitrates(bytes, duration, true)).toThrow()
    expect(() => targetVideoBitrates(1024, 60, true)).toThrow()
    const nativeAac = targetVideoBitrates(bytes, 10, true, 96000)
    expect(nativeAac.audio).toBeGreaterThanOrEqual(96000)
    expect(((nativeAac.video + nativeAac.audio) * 10) / 8 + 4096).toBeLessThanOrEqual(bytes * 0.94)
    expect(() => targetVideoBitrates(40 * 1024, 3, true, 96000)).toThrow()
  })
  it('reports larger outputs without claiming a size reduction', () => {
    const summary = compressionSummary(100, [
      { name: 'file.webp', blob: new Blob([new Uint8Array(120)]) },
    ])
    expect(summary.en).toContain('not smaller')
    expect(summary['zh-CN']).toContain('未变小')
  })
})

describe('compression field validation', () => {
  for (const id of ['image-compress', 'video-compress']) {
    it(`${id} validates active fields and ignores cleared fields from the other mode`, async () => {
      const registry = new ToolRegistry()
      const builtin = builtinTools.find((tool) => tool.id === id)!
      registry.register({
        ...builtin,
        execute: async () => ({ summary: { en: 'Done', 'zh-CN': '完成' } }),
      })
      const context = {
        locale: 'en' as const,
        signal: new AbortController().signal,
        onProgress: () => {},
      }
      const files = [new File(['data'], id === 'image-compress' ? 'file.png' : 'file.mp4')]
      const manual = { ...builtin.initialValues, files, targetSize: '', sizeUnit: '' }
      await expect(registry.run(id, manual, context)).resolves.toBeDefined()
      const target = {
        ...builtin.initialValues,
        files,
        compressionMode: 'target',
        quality: '',
        videoBitrate: '',
        audioBitrate: '',
      }
      // Only fields that belong to the specific tool may be present.
      for (const key of Object.keys(target))
        if (!(key in builtin.initialValues)) delete target[key as keyof typeof target]
      await expect(registry.run(id, target, context)).resolves.toBeDefined()
      await expect(registry.run(id, { ...target, targetSize: 0 }, context)).rejects.toThrow()
      await expect(registry.run(id, { ...target, targetSize: '' }, context)).rejects.toThrow()
      await expect(registry.run(id, { ...target, unexpected: 123 }, context)).rejects.toThrow()
      await expect(
        registry.run(
          id,
          { ...manual, [id === 'image-compress' ? 'quality' : 'videoBitrate']: 0 },
          context,
        ),
      ).rejects.toThrow()
    })
  }
})
