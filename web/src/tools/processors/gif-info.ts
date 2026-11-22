import { LocalizedError } from '../../lib/locale'

export interface GifInfo {
  width: number
  height: number
  frames: number
  duration: number
  lastDelay: number
}

const invalidGif = () =>
  new LocalizedError('GIF 文件无效或已损坏。', 'The GIF file is invalid or damaged.')

// Inspect block boundaries before decoding, without allocating decoded frames.
// FFmpeg and browsers use 100 ms for an absent or sub-20 ms GIF frame delay.
export function inspectGif(bytes: Uint8Array): GifInfo {
  if (bytes.length < 14 || !/^GIF8[79]a$/.test(new TextDecoder().decode(bytes.subarray(0, 6))))
    throw invalidGif()
  let offset = 6
  const take = (length: number) => {
    if (offset + length > bytes.length) throw invalidGif()
    const start = offset
    offset += length
    return start
  }
  const word = (at: number) => bytes[at] | (bytes[at + 1] << 8)
  const screen = take(7)
  const width = word(screen),
    height = word(screen + 2)
  if (!width || !height) throw invalidGif()
  if (width > 4096 || height > 4096 || width * height > 16_000_000)
    throw new LocalizedError(
      'GIF 尺寸最多 4096 × 4096 且不超过 1600 万像素，请先缩小尺寸。',
      'GIF dimensions must fit 4096 × 4096 and 16 million pixels. Resize the GIF first.',
    )
  if (bytes[screen + 4] & 0x80) take(3 * 2 ** ((bytes[screen + 4] & 7) + 1))
  const skipBlocks = () => {
    let length: number
    do {
      length = bytes[take(1)]
      take(length)
    } while (length)
  }
  let frames = 0,
    centiseconds = 0,
    delay = 10,
    lastDelay = 10
  while (offset < bytes.length) {
    const type = bytes[take(1)]
    if (type === 0x3b) {
      if (!frames) throw invalidGif()
      return { width, height, frames, duration: centiseconds / 100, lastDelay: lastDelay / 100 }
    }
    if (type === 0x21) {
      const label = bytes[take(1)]
      if (label === 0xf9) {
        if (bytes[take(1)] !== 4) throw invalidGif()
        const control = take(4)
        const rawDelay = word(control + 1)
        delay = rawDelay < 2 ? 10 : rawDelay
        if (bytes[take(1)] !== 0) throw invalidGif()
      } else {
        skipBlocks()
        if (label === 0x01) delay = 10
      }
    } else if (type === 0x2c) {
      const image = take(9)
      const frameWidth = word(image + 4),
        frameHeight = word(image + 6)
      if (
        !frameWidth ||
        !frameHeight ||
        word(image) + frameWidth > width ||
        word(image + 2) + frameHeight > height
      )
        throw invalidGif()
      if (bytes[image + 8] & 0x80) take(3 * 2 ** ((bytes[image + 8] & 7) + 1))
      const codeSize = bytes[take(1)]
      if (codeSize < 2 || codeSize > 8) throw invalidGif()
      skipBlocks()
      frames++
      centiseconds += delay
      lastDelay = delay
      delay = 10
      if (frames > 1800 || centiseconds > 6000)
        throw new LocalizedError(
          'GIF 单次播放最多 60 秒、1800 帧，请先截取或减少帧数。',
          'A GIF cycle must fit 60 seconds and 1800 frames. Trim it or reduce the frame count first.',
        )
    } else throw invalidGif()
  }
  throw invalidGif()
}

export function fitGifDimensions(width: number, height: number, maxEdge: number) {
  const ratio = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}
