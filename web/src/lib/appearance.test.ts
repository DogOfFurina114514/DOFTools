import { afterEach, describe, expect, it, vi } from 'vitest'
import { isStyleId } from './appearance'
import { readStorage } from './storage'

afterEach(() => vi.unstubAllGlobals())
describe('appearance preference recovery', () => {
  it('recovers from corrupt, obsolete or inaccessible saved style preferences', () => {
    for (const value of ['not-json', '"obsolete-style"', 'null', '[]', '42']) {
      vi.stubGlobal('localStorage', { getItem: () => value })
      expect(readStorage('style', 'default', isStyleId)).toBe('default')
    }
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage blocked')
      },
    })
    expect(readStorage('style', 'default', isStyleId)).toBe('default')
  })
  it('restores a valid game appearance', () => {
    vi.stubGlobal('localStorage', { getItem: () => '"endfield"' })
    expect(readStorage('style', 'default', isStyleId)).toBe('endfield')
  })
})
