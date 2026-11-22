import { describe, expect, it } from 'vitest'
import { inspectGif, fitGifDimensions } from './gif-info'
import { gifFixture } from '../../../tests/helpers/gif-fixture'

describe('GIF block and resource validation', () => {
  it('reads unequal frame delays and applies the browser delay floor', () => {
    expect(inspectGif(gifFixture())).toEqual({
      width: 95,
      height: 55,
      frames: 3,
      duration: 0.89,
      lastDelay: 0.29,
    })
    expect(inspectGif(gifFixture([0, 1, 2]))).toMatchObject({ duration: 0.22, lastDelay: 0.02 })
  })
  it('rejects wrong types, truncated blocks and frames outside the canvas', () => {
    const bytes = gifFixture()
    for (const end of [0, 6, 12, 20, 45, bytes.length - 2, bytes.length - 1])
      expect(() => inspectGif(bytes.subarray(0, end))).toThrow('无效')
    expect(() => inspectGif(new TextEncoder().encode('not a GIF file'))).toThrow('无效')
    const smallerCanvas = new Uint8Array(bytes)
    smallerCanvas[6] = 2
    expect(() => inspectGif(smallerCanvas)).toThrow('无效')
  })
  it('bounds duration, frame count and canvas before any decoder is loaded', () => {
    expect(() => inspectGif(gifFixture([6001], 1, 1))).toThrow('60 秒')
    expect(() => inspectGif(gifFixture(Array(1801).fill(2), 1, 1))).toThrow('1800 帧')
    const huge = gifFixture([10], 1, 1)
    huge[6] = 255
    huge[7] = 255
    expect(() => inspectGif(huge)).toThrow('4096')
  })
  it('fits portrait and landscape without upscaling or zero-sized edges', () => {
    expect(fitGifDimensions(100, 50, 480)).toEqual({ width: 100, height: 50 })
    expect(fitGifDimensions(200, 100, 64)).toEqual({ width: 64, height: 32 })
    expect(fitGifDimensions(1, 4096, 64)).toEqual({ width: 1, height: 64 })
  })
})
