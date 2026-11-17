import { describe, expect, it } from 'vitest'
import { bilingual, localize, translate, LocalizedError, errorMessage, isLocale } from './locale'
describe('localization', () => {
  it('resolves both languages and interpolates values without changing unknown placeholders', () => {
    const name = bilingual('芙芙的狗工具箱', 'DogOfFurina Toolbox')
    expect(localize('en', name)).toBe('DogOfFurina Toolbox')
    expect(localize('zh-CN', name)).toBe('芙芙的狗工具箱')
    expect(translate('en', '{count} 个文件', '{count} files {unknown}', { count: 2 })).toBe(
      '2 files {unknown}',
    )
    expect(isLocale('en')).toBe(true)
    expect(isLocale('unknown')).toBe(false)
  })
  it('keeps errors bilingual across worker serialization', () => {
    const message = structuredClone(errorMessage(new LocalizedError('加载失败', 'Loading failed')))
    expect(localize('en', message)).toBe('Loading failed')
    expect(localize('zh-CN', message)).toBe('加载失败')
  })
})
