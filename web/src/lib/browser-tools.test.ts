import { describe, expect, it } from 'vitest'
import {
  countText,
  decodeBase64,
  encodeBase64,
  formatBytes,
  formatJson,
  generateUuids,
  minifyJson,
} from './browser-tools'

describe('local text tools', () => {
  it('round-trips Chinese, emoji, multiline and large UTF-8 input', () => {
    for (const text of ['', '芙芙🐶\n你好，世界！', '你好 hello 🌿'.repeat(5000)])
      expect(decodeBase64(encodeBase64(text))).toBe(text)
  })
  it('rejects malformed Base64 and invalid UTF-8 rather than silently corrupting text', () => {
    expect(() => decodeBase64('???')).toThrow()
    expect(() => decodeBase64('/w==')).toThrow()
    expect(decodeBase64('aG Vs\nbG8=')).toBe('hello')
  })
  it('counts Chinese words, English words, line endings, paragraphs and emoji', () => {
    expect(countText('你好 world 🐶\n\n再见')).toEqual({
      characters: 14,
      charactersWithoutSpaces: 10,
      words: 5,
      lines: 3,
      paragraphs: 2,
    })
    expect(countText('')).toEqual({
      characters: 0,
      charactersWithoutSpaces: 0,
      words: 0,
      lines: 0,
      paragraphs: 0,
    })
    expect(countText('a\r\nb')).toMatchObject({ lines: 2, words: 2 })
  })
  it('formats JSON without changing its data and rejects invalid JSON', () => {
    const source = '{"name":"芙芙","enabled":true,"items":[1,null,2]}'
    expect(JSON.parse(formatJson(source))).toEqual(JSON.parse(source))
    expect(minifyJson(formatJson(source))).toBe(source)
    expect(() => formatJson('{oops}')).toThrow()
  })
  it('generates distinct UUID v4 values and bounds the batch size', () => {
    const values = generateUuids(100)
    expect(new Set(values).size).toBe(100)
    expect(
      values.every((value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value),
      ),
    ).toBe(true)
    for (const invalid of [0, -1, 1.5, 101, NaN]) expect(() => generateUuids(invalid)).toThrow()
  })
  it('formats file sizes including empty files', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 ** 2)).toBe('1.0 MB')
  })
})
