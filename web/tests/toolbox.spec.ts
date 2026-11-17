import { test, expect } from '@playwright/test'

const styles = [
  { id: 'default', name: '默认', game: false },
  { id: 'material', name: '原生 Material 3', game: false },
  { id: 'fluent', name: 'Fluent Design', game: false },
  { id: 'glass', name: '液态玻璃', game: false },
  { id: 'genshin', name: '原神', game: true },
  { id: 'zenless', name: '绝区零', game: true },
  { id: 'endfield', name: '终末地', game: true },
  { id: 'minecraft', name: 'Minecraft', game: true },
]

test('home removes tools, the dog and avatar, and blocks previous tool routes', async ({
  page,
}) => {
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (!/^(http:\/\/127\.0\.0\.1:5173|blob:|data:)/.test(request.url()))
      external.push(request.url())
  })
  await page.goto('/')
  await expect(page.locator('.category-card')).toHaveCount(5)
  await expect(page.locator('.tool-card, .hero-dog, .avatar, .hero-row, .ai-promo')).toHaveCount(0)
  await expect(page.locator('.sidebar a[href="#/settings"]')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/home-default.png', fullPage: true })
  await page.goto('/#/tool/image-compress')
  await expect(page.getByRole('heading', { name: '这个角落，暂时留白。' })).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('categories remain empty and global search finds pages instead of tools', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: '搜索页面' })
  await expect(dialog.getByRole('textbox')).toBeFocused()
  await dialog.getByRole('textbox').fill('图片')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/category\/image$/)
  await expect(page.getByRole('heading', { name: '这里，先留一个位置。' })).toBeVisible()
  await expect(page.locator('.tool-card')).toHaveCount(0)
})

test('Material 3 uses real Material Web buttons and switches', async ({ page }) => {
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: '原生 Material 3', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-style', 'material')
  await page.waitForFunction(
    () => !!customElements.get('md-filled-button') && !!customElements.get('md-switch'),
  )
  await expect(page.locator('md-filled-button')).not.toHaveCount(0)
  await expect(page.locator('md-switch')).toHaveCount(1)
  await page.getByRole('button', { name: '深色', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const nativeSwitch = page.locator('md-switch')
  await nativeSwitch.click()
  expect(await page.evaluate(() => localStorage.getItem('fufu:openings'))).toBe('false')
  await page.reload()
  await expect(page.getByRole('radio', { name: '原生 Material 3', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.opening')).toHaveCount(0)
})

for (const style of styles.filter((item) => item.game)) {
  test(`${style.name}: unique opening plays on selection, replay and reload`, async ({ page }) => {
    await page.goto('/#/settings')
    await page.getByRole('radio', { name: style.name, exact: true }).click()
    const opening = page.getByRole('dialog', { name: `${style.name}开屏动画` })
    await expect(opening).toBeVisible()
    await expect(opening).toHaveClass(new RegExp(`opening-${style.id}`))
    await page.waitForTimeout(550)
    await page.screenshot({ path: `test-results/opening-${style.id}.png` })
    await opening.getByRole('button', { name: '跳过' }).click()
    await expect(opening).toHaveCount(0)
    await page.getByRole('button', { name: '重播开屏' }).click()
    await expect(opening).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(opening).toHaveCount(0)
    await page.reload()
    await expect(opening).toBeVisible()
    await expect(opening).toHaveCount(0, { timeout: 5000 })
    await expect(page.getByRole('radio', { name: style.name, exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
}

test('opening preference is persistent and a disabled animation can be manually replayed', async ({
  page,
}) => {
  await page.goto('/#/settings')
  await page.getByRole('switch', { name: '游戏风格开屏动画' }).click()
  await page.getByRole('radio', { name: '终末地', exact: true }).click()
  await expect(page.locator('.opening')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.opening')).toHaveCount(0)
  await expect(page.getByRole('switch', { name: '游戏风格开屏动画' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await page.getByRole('button', { name: '重播开屏' }).click()
  await expect(page.getByRole('dialog', { name: '终末地开屏动画' })).toBeVisible()
  await page.getByRole('button', { name: '跳过' }).click()
})

test('reduced motion keeps game opening brief and restores keyboard focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/settings')
  const radio = page.getByRole('radio', { name: '原神', exact: true })
  await radio.click()
  await expect(page.locator('.opening')).toHaveCount(0, { timeout: 2000 })
  await expect(radio).toBeFocused()
  await expect(page.getByText('系统已开启减少动态效果', { exact: false })).toBeVisible()
})

for (const style of styles) {
  test(`${style.name}: whole-site appearance, light/dark and mobile layout stay usable`, async ({
    page,
  }) => {
    await page.goto('/#/settings')
    await page.getByRole('switch', { name: '游戏风格开屏动画' }).click()
    await page.getByRole('radio', { name: style.name, exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-style', style.id)
    if (style.id === 'material')
      await page.waitForFunction(() => !!customElements.get('md-filled-button'))
    await page.screenshot({ path: `test-results/settings-${style.id}.png`, fullPage: true })
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: '工具箱概览' })
      .click()
    await expect(page.locator('.hero-row, .ai-promo, .scene-art')).toHaveCount(0)
    await page.screenshot({ path: `test-results/home-${style.id}.png`, fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: '切换深色主题' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForFunction(
      () => document.querySelector('.sidebar')!.getBoundingClientRect().right <= 0,
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/mobile-${style.id}.png`, fullPage: true })
    await page.getByRole('button', { name: '打开导航' }).click()
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: '设置与外观' })
      .click()
    await expect(page.locator('.sidebar')).not.toHaveClass(/mobile-open/)
    await expect(page.getByRole('radiogroup', { name: '普通主题' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('AI exposes the real local model loader and accepts local image attachments', async ({
  page,
}) => {
  await page.goto('/#/ai')
  await expect(page.getByText('Qwen3.5-0.8B', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '开启助手' })).toBeVisible()
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '帮我描述这张图片' }).click()
  await expect(page.getByRole('textbox', { name: 'AI 对话内容' })).toHaveValue('帮我描述这张图片')
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 100
    canvas.height = 100
    return canvas.toDataURL().split(',')[1]
  })
  await page.locator('input[type="file"]').setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  })
  await expect(page.getByRole('img', { name: '待识别图片的本地预览' })).toBeVisible()
  await expect(page.getByText('文件仅在本地读取')).toBeVisible()
  await page.getByRole('button', { name: '移除 sample.png' }).click()
  await expect(page.locator('.image-attachment')).toHaveCount(0)
})

test('mobile devices do not expose an AI entry or image picker', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://127.0.0.1:5173',
          localStorage: [{ name: 'fufu:onboarded', value: 'true' }],
        },
      ],
    },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:5173/')
  await expect(page.locator('[data-ai-nav], .ai-promo')).toHaveCount(0)
  await page.goto('http://127.0.0.1:5173/#/ai')
  await expect(page.getByRole('heading', { name: 'AI 助手仅在电脑端提供' })).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
  await context.close()
})
