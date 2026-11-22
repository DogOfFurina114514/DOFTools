// A real, independently encoded GIF with a transparent border, three colors,
// disposal-to-background, an infinite loop and unequal centisecond delays.
export function gifFixture(delays = [17, 43, 29], width = 95, height = 55) {
  const bytes = [...new TextEncoder().encode('GIF89a')]
  const word = (value: number) => bytes.push(value & 255, value >> 8)
  word(width)
  word(height)
  bytes.push(0x81, 0, 0, 0, 0, 0, 240, 20, 20, 20, 20, 240, 20, 220, 20)
  bytes.push(0x21, 0xff, 11, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1, 0, 0, 0)
  delays.forEach((delay, frame) => {
    bytes.push(0x21, 0xf9, 4, 9)
    word(delay)
    bytes.push(0, 0, 0x2c)
    word(0)
    word(0)
    word(width)
    word(height)
    bytes.push(0, 2)
    const packed: number[] = []
    let bits = 0,
      count = 0
    const code = (value: number) => {
      bits |= value << count
      count += 3
      while (count >= 8) {
        packed.push(bits & 255)
        bits >>= 8
        count -= 8
      }
    }
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        // Clearing before each pixel keeps the LZW code width fixed at three bits.
        code(4)
        code(
          x >= width / 4 && x < (width * 3) / 4 && y >= height / 4 && y < (height * 3) / 4
            ? (frame % 3) + 1
            : 0,
        )
      }
    code(5)
    if (count) packed.push(bits & 255)
    for (let at = 0; at < packed.length; at += 255) {
      const block = packed.slice(at, at + 255)
      bytes.push(block.length, ...block)
    }
    bytes.push(0)
  })
  bytes.push(0x3b)
  return new Uint8Array(bytes)
}
