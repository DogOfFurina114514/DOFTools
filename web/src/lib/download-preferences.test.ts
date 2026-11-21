import { afterEach, expect, it, vi } from 'vitest'
import { modelDownloadThreads, saveDownloadThreads } from './download-preferences'

afterEach(() => vi.unstubAllGlobals())
it('defaults to 64 and restores only supported thread preferences', () => {
  let value: string | null = null
  vi.stubGlobal('localStorage', {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
  })
  expect(modelDownloadThreads()).toBe(64)
  for (const threads of [32, 64, 128] as const) {
    saveDownloadThreads(threads)
    expect(modelDownloadThreads()).toBe(threads)
  }
  for (const invalid of ['256', '0', 'null', '"64"', '{}', 'malformed']) {
    value = invalid
    expect(modelDownloadThreads()).toBe(64)
  }
})
