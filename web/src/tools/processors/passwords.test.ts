import { describe, expect, it } from 'vitest'
import { passwordPlan } from './passwords'
const values = {
  mode: 'brute',
  password: '',
  dictionary: '',
  charset: '01',
  minLength: 1,
  maxLength: 2,
  maxAttempts: 100,
}
describe('bounded password search', () => {
  it('enumerates each length and preserves leading zeroes', () =>
    expect([...passwordPlan(values).candidates()]).toEqual(['0', '1', '00', '01', '10', '11']))
  it('stops at the configured attempt limit and deduplicates a priority guess', () =>
    expect([...passwordPlan({ ...values, password: '00', maxAttempts: 3 }).candidates()]).toEqual([
      '00',
      '0',
      '1',
    ]))
  it('preserves intentional password spaces and deduplicates dictionary entries', () =>
    expect([
      ...passwordPlan({
        ...values,
        mode: 'dictionary',
        dictionary: ' leading\r\ntrailing \n leading',
      }).candidates(),
    ]).toEqual([' leading', 'trailing ']))
  it('rejects empty dictionaries, missing known passwords and invalid ranges', () => {
    expect(() => passwordPlan({ ...values, mode: 'dictionary' })).toThrow()
    expect(() => passwordPlan({ ...values, mode: 'known' })).toThrow()
    expect(() => passwordPlan({ ...values, minLength: 3, maxLength: 1 })).toThrow()
    expect(() => passwordPlan({ ...values, charset: '' })).toThrow()
  })
})
