import { test, expect } from '@playwright/test'
import { selectChoice } from './helpers/controls'

test('language switches the site and metadata, persists, and removes credits', async ({ page }) => {
  await page.goto('/settings')
  await page
    .getByRole('group', { name: '网站语言' })
    .getByRole('button', { name: 'English', exact: true })
    .click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveTitle('Settings & appearance · DogOfFurina Toolbox')
  await expect(page.locator('.brand strong')).toHaveText('DogOfFurina Toolbox')
  await expect(page.locator('.sidebar-credit, .settings-footnote')).toHaveCount(0)
  expect((await page.locator('body').innerText()).replaceAll('中文', '')).not.toMatch(
    /made (with|by)|by fufu/i,
  )
  await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Settings & appearance' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Overview', exact: true })
    .click()
  await page.keyboard.press('Control+k')
  await page.getByRole('textbox', { name: 'Search keywords' }).fill('图片')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/category\/image$/)
  await expect(page.getByRole('heading', { name: 'Image tools' })).toBeVisible()
  await page.getByRole('button', { name: '中文', exact: true }).click()
  await expect(page.getByRole('heading', { name: '图片工具' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
})

test('all English styles, AI and mobile layouts have translated text without overflow', async ({
  page,
}) => {
  // Eight desktop/mobile theme passes also include cold Vite dependency loading.
  test.setTimeout(60000)
  await page.addInitScript(() => {
    localStorage.setItem('fufu:language', '"en"')
    localStorage.setItem('fufu:openings', 'false')
  })
  for (const name of [
    'Default',
    'Material 3',
    'Fluent Design',
    'Liquid Glass',
    'Genshin Impact',
    'Zenless Zone Zero',
    'Arknights: Endfield',
    'Minecraft',
  ]) {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/settings')
    await page.getByRole('radio', { name, exact: true }).click()
    expect((await page.locator('body').innerText()).replaceAll('中文', '')).not.toMatch(
      /\p{Script=Han}/u,
    )
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Overview', exact: true })
      .click()
    expect((await page.locator('body').innerText()).replaceAll('中文', '')).not.toMatch(
      /\p{Script=Han}/u,
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await page.getByRole('link', { name: 'Settings & appearance', exact: true }).click()
    await expect(page.locator('.topbar').getByRole('group', { name: 'Language' })).toBeVisible()
    await expect(page.locator('main .language-settings')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/ai')
  await expect(page.getByRole('button', { name: 'Start assistant' })).toBeVisible()
  expect((await page.locator('body').innerText()).replaceAll('中文', '')).not.toMatch(
    /\p{Script=Han}/u,
  )
  await page.getByRole('textbox', { name: 'AI message' }).fill('Keep this draft')
  await page.getByRole('button', { name: '中文', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'AI 对话内容' })).toHaveValue('Keep this draft')
})

test('tool fields, options, result and errors translate while values and files remain intact', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const { registerLocaleFixture } = await import('/tests/fixtures/locale-tool.ts')
    registerLocaleFixture()
    // Keep the in-memory fixture registration when opening its workspace.
    history.pushState({}, '', '/tool/locale-fixture')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.getByRole('textbox', { name: '输入内容' }).fill('my draft')
  await selectChoice(page.getByRole('combobox', { name: '输出格式' }), 'large')
  await page.getByRole('checkbox', { name: '保留元数据' }).click()
  await page
    .locator('.ui-file-picker input')
    .setInputFiles({ name: 'local.txt', mimeType: 'text/plain', buffer: Buffer.from('test') })
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Input text' })).toHaveValue('my draft')
  await expect(page.getByRole('combobox', { name: 'Output format' })).toHaveAttribute(
    'data-value',
    'large',
  )
  await page.getByRole('combobox', { name: 'Output format' }).click()
  await expect(page.getByRole('option', { name: 'Large', exact: true })).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('checkbox', { name: 'Keep metadata' })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Remove local.txt' })).toBeVisible()
  await page.getByRole('button', { name: 'Run tool', exact: true }).click()
  await expect(page.locator('.ui-result')).toContainText('Finished: my draft')
  await page.getByRole('button', { name: '中文', exact: true }).click()
  await expect(page.locator('.ui-result')).toContainText('处理完成：my draft')
  await page.getByRole('textbox', { name: '输入内容' }).fill('error')
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('测试处理失败')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Fixture processing failed')
})

for (const style of ['genshin', 'zenless', 'endfield']) {
  test(`${style} opening uses English including progress and the first HTML paint`, async ({
    page,
  }) => {
    await page.addInitScript((style) => {
      localStorage.setItem('fufu:language', '"en"')
      localStorage.setItem('fufu:style', JSON.stringify(style))
    }, style)
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/src/pages/AIPage.tsx*', async (route) => {
      await held
      await route.continue()
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('.opening')).toBeVisible()
    await expect(page.locator('.opening h1')).toHaveText('DogOfFurina Toolbox')
    expect(await page.locator('.opening').innerText()).not.toMatch(/\p{Script=Han}/u)
    release()
    await expect(page.locator('.opening')).toHaveCount(0)
  })
}

test('theme has a smooth fallback and respects reduced motion', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'startViewTransition', { value: undefined, configurable: true })
  })
  await page.goto('/')
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await page.getByRole('button', { name: '切换深色主题' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const middle = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await expect(page.locator('html')).not.toHaveAttribute('data-theme-transition', 'true')
  const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(after).not.toBe(before)
  expect(middle).not.toBe(after)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '切换浅色主题' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme-transition', 'true')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(before)
})

test('system theme follows OS changes, saves its choice and leaves manual choices in control', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/settings')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: '跟随系统', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: '深色', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: '跟随系统', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('fufu:theme'))).toBe('"system"')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('drawn language slider supports keyboard switching and aligns its indicator', async ({
  page,
}) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: '中文', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('button', { name: 'English', exact: true })).toBeFocused()
  await page.getByRole('radio', { name: 'Material 3', exact: true }).click()
  await expect(page.locator('.language-slider button')).toHaveCount(2)
  await page.getByRole('button', { name: 'English', exact: true }).focus()
  await page.keyboard.press('Home')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByRole('button', { name: '中文', exact: true })).toBeFocused()
  await expect(page.locator('main .language-settings')).toHaveCount(0)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const language of ['中文', 'English']) {
      await page.getByRole('button', { name: language, exact: true }).click()
      await expect
        .poll(() =>
          page.locator('.language-slider').evaluate((slider) => {
            const active = slider.querySelector('button[aria-pressed="true"]')!
            const thumb = slider.querySelector('.language-thumb')!.getBoundingClientRect()
            const label = active.getBoundingClientRect()
            const button = label
            return Math.max(
              Math.abs(thumb.x + thumb.width / 2 - label.x - label.width / 2),
              Math.abs(thumb.y + thumb.height / 2 - label.y - label.height / 2),
              Math.abs(button.height - thumb.height),
            )
          }),
        )
        .toBeLessThan(0.5)
    }
  }
})

test('native theme transitions keep the AI draft through repeated switches', async ({ page }) => {
  await page.goto('/ai')
  await page.getByRole('textbox', { name: 'AI 对话内容' }).fill('keep this draft')
  await page.evaluate(() => {
    const original = document.startViewTransition.bind(document)
    Object.assign(window, { themeTransitions: 0, themeDuration: '' })
    document.startViewTransition = (callback: Parameters<Document['startViewTransition']>[0]) => {
      const state = window as unknown as { themeTransitions: number; themeDuration: string }
      state.themeTransitions++
      const transition = original(callback)
      void transition.ready
        .then(() => {
          state.themeDuration = getComputedStyle(
            document.documentElement,
            '::view-transition-new(root)',
          ).animationDuration
        })
        .catch(() => {})
      return transition
    }
  })
  await page.getByRole('button', { name: '切换深色主题' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: '切换浅色主题' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('textbox', { name: 'AI 对话内容' })).toHaveValue('keep this draft')
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { themeDuration: string }).themeDuration))
    .toBe('0.24s')
  expect(
    await page.evaluate(() => (window as unknown as { themeTransitions: number }).themeTransitions),
  ).toBe(2)
})
