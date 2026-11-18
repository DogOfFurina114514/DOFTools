import { LocalizedError } from '../../lib/locale'
import type { ToolValues } from '../registry'

const commonPasswords = [
  '123456',
  '123456789',
  '12345',
  '12345678',
  'password',
  'Password',
  '123123',
  '111111',
  '000000',
  '1234',
  'admin',
  'qwerty',
  '666666',
  '888888',
  '1234567890',
  '123321',
  'abc123',
  'iloveyou',
  'password123',
  'P@ssw0rd',
  '2026',
  '2025',
]
export function passwordPlan(values: ToolValues) {
  const mode = String(values.mode)
  const first = String(values.password ?? '')
  const dictionary = String(values.dictionary ?? '')
    .split(/\r?\n/)
    .filter((value) => value.length > 0)
  const prefixes = [
    ...new Set([
      ...(first ? [first] : []),
      ...(['auto'].includes(mode) ? commonPasswords : []),
      ...(['auto', 'dictionary'].includes(mode) ? dictionary : []),
    ]),
  ]
  if (mode === 'known' && !first)
    throw new LocalizedError('请输入已知密码。', 'Enter the known password.')
  if (mode === 'dictionary' && !prefixes.length)
    throw new LocalizedError('请输入至少一个候选密码。', 'Enter at least one candidate password.')
  const charset = [...new Set(Array.from(mode === 'auto' ? '0123456789' : String(values.charset)))]
  const min = mode === 'auto' ? 1 : Number(values.minLength)
  const max = mode === 'auto' ? 4 : Number(values.maxLength)
  const brute = ['auto', 'brute'].includes(mode)
  if (brute && (!charset.length || charset.length > 64 || min > max))
    throw new LocalizedError(
      '请检查字符集与最短 / 最长长度。',
      'Check the character set and minimum / maximum lengths.',
    )
  const total = Math.min(
    Number(values.maxAttempts),
    prefixes.length +
      (brute
        ? Array.from(
            { length: max - min + 1 },
            (_, index) => charset.length ** (min + index),
          ).reduce((a, n) => a + n, 0)
        : 0),
  )
  function* candidates() {
    let emitted = 0
    for (const password of prefixes) {
      if (emitted++ >= total) return
      yield password
    }
    if (!brute) return
    for (let length = min; length <= max; length++) {
      const indices = Array<number>(length).fill(0)
      for (;;) {
        const password = indices.map((index) => charset[index]).join('')
        if (!prefixes.includes(password)) {
          if (emitted++ >= total) return
          yield password
        }
        let position = length - 1
        while (position >= 0 && ++indices[position] === charset.length) {
          indices[position] = 0
          position--
        }
        if (position < 0) break
      }
    }
  }
  return { total, candidates }
}
