import { test, expect } from '@playwright/test'

test('phone navigation, teaching and help omit AI, and a direct URL never loads a model', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    storageState: { cookies: [], origins: [] },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  })
  const page = await context.newPage()
  const modelRequests: string[] = []
  page.on('request', (request) => {
    if (/\/models\/|ai\.worker/.test(request.url())) modelRequests.push(request.url())
  })
  await page.goto('http://127.0.0.1:5173/')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '进入工具箱并开始教学' }).click()
  const tour = page.getByRole('dialog', { name: '使用教学' })
  await expect(tour).toContainText('1 / 4')
  await expect(page.locator('[data-ai-nav]')).toHaveCount(0)
  for (let step = 0; step < 3; step++) {
    await expect(tour).not.toContainText(/AI/)
    await tour.getByRole('button', { name: '下一步' }).click()
    await expect(page).not.toHaveURL(/\/ai$/)
  }
  await tour.getByRole('button', { name: '开始使用' }).click()
  await page.locator('.topbar').getByRole('button', { name: '使用指南' }).click()
  await expect(page.getByRole('dialog')).not.toContainText(/AI/)
  await page.getByRole('button', { name: '关闭使用指南' }).click()
  await page.goto('http://127.0.0.1:5173/ai')
  await expect(page.getByRole('heading', { name: 'AI 助手仅在电脑端提供' })).toBeVisible()
  await expect(page.locator('input[type=file]')).toHaveCount(0)
  expect(modelRequests).toEqual([])
  await context.close()
})

test('page navigation animates lightly and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.locator('.sidebar-nav a[href="/category/audio"]').click()
  await expect(page).toHaveURL(/\/category\/audio$/)
  expect(
    await page
      .locator('.route-page')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('page-enter')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('.sidebar-nav a[href="/category/video"]').click()
  expect(
    await page
      .locator('.route-page')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none')
})

test('first visit setup saves preferences, teaches by navigation, and can reopen', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('fufu:onboarded'))
  await page.reload()
  const setup = page.getByRole('dialog')
  await expect(setup.getByRole('heading', { name: '先选一种语言' })).toBeVisible()
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '')
  await setup.getByRole('button', { name: /English/ }).click()
  await setup.getByRole('button', { name: 'Next' }).click()
  await expect(setup.getByRole('heading', { name: 'Choose your color theme' })).toBeVisible()
  await setup.getByRole('button', { name: 'Dark', exact: true }).click()
  await setup.getByRole('button', { name: 'Next' }).click()
  await setup.getByRole('radio', { name: 'Native Material 3', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-style', 'material')
  await setup.getByRole('button', { name: 'Enter toolbox & start tour' }).click()
  const tour = page.getByRole('dialog', { name: 'Guided tour' })
  await expect(tour).toContainText('Start with five categories')
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert')
  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/\/category\/image$/)
  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/\/ai$/)
  await expect(page.getByRole('button', { name: 'Start assistant', exact: true })).toBeVisible()
  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/\/$/)
  await tour.getByRole('button', { name: 'Start exploring' }).click()
  await page.reload()
  await expect(page.locator('.setup-dialog, .tour-card')).toHaveCount(0)
  expect(
    await page.evaluate(() =>
      ['language', 'theme', 'style', 'onboarded'].map((key) => localStorage.getItem(`fufu:${key}`)),
    ),
  ).toEqual(['"en"', '"dark"', '"material"', 'true'])
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Restart guide' }).click()
  await expect(page.getByRole('heading', { name: 'Choose your language' })).toBeVisible()
  await page.getByRole('button', { name: 'Close setup' }).click()
  await expect(page.locator('.setup-dialog')).toHaveCount(0)
})

test('game style selected during setup opens before guided teaching', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('fufu:onboarded'))
  await page.reload()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('radio', { name: '终末地', exact: true }).click()
  await expect(page.locator('.opening')).toHaveCount(0)
  await page.getByRole('button', { name: '进入工具箱并开始教学' }).click()
  await expect(page.locator('.opening')).toBeVisible()
  await expect(page.locator('.tour-card')).toHaveCount(0)
  await expect(page.locator('.opening')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('dialog', { name: '使用教学' })).toBeVisible()
})

test('dismissed local chat notice stays hidden across routes, reload and language changes', async ({
  page,
}) => {
  await page.goto('/ai')
  await expect(page.locator('.ai-storage-notice')).toBeVisible()
  await page.getByRole('button', { name: '关闭本地聊天提示' }).click()
  await expect(page.locator('.ai-storage-notice')).toHaveCount(0)
  await page.goto('/settings')
  await page.locator('[data-ai-nav]').click()
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.reload()
  await expect(page.locator('.ai-storage-notice')).toHaveCount(0)
})

test('audio follows video in navigation and search, with no enabled tools', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.category-card')).toHaveCount(5)
  const labels = await page.locator('.sidebar-nav .nav-item').allTextContents()
  expect(labels.join(' ')).toMatch(/视频工具.*音频工具.*文档工具/)
  await page.locator('[data-ai-nav]').click()
  await expect(page.locator('[data-ai-nav]')).toHaveClass(/nav-item active/)
  await expect(page.locator('.sidebar-ai, .ai-running-bar')).toHaveCount(0)
  await page.keyboard.press('Control+k')
  await page.getByRole('textbox', { name: '搜索关键词' }).fill('audio')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/category\/audio$/)
  await expect(page.getByRole('heading', { name: '音频工具' })).toBeVisible()
  await expect(page.locator('.category-grid')).toHaveCount(0)
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Audio tools' })).toBeVisible()
})

test('themed page scrollbar drags and scrolls with keyboard; native chrome is hidden', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 650 })
  await page.goto('/settings')
  const rail = page.locator('.themed-scrollbar[data-scroll-kind=page].axis-y')
  await expect(rail).toBeVisible()
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).scrollbarWidth),
  ).toBe('none')
  expect(
    await page
      .locator('.topbar button')
      .first()
      .evaluate((element) => getComputedStyle(element).webkitTapHighlightColor),
  ).toBe('rgba(0, 0, 0, 0)')
  const thumb = await rail.locator('.themed-scroll-thumb').boundingBox()
  await page.mouse.move(thumb!.x + 5, thumb!.y + thumb!.height / 2)
  await page.mouse.down()
  await page.mouse.move(thumb!.x + 5, thumb!.y + thumb!.height / 2 + 140, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200)
  await rail.focus()
  await page.keyboard.press('Home')
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  await page.keyboard.press('End')
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300)
  await page.getByRole('button', { name: '重新打开向导' }).click()
  await expect(rail).toHaveCount(0)
  await expect(page.locator('.setup-dialog')).toBeVisible()
})

test('mobile setup uses a themed draggable overflow rail and keeps touch highlights clear', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 650 })
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('fufu:onboarded'))
  await page.reload()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.locator('.themed-scrollbar[data-scroll-kind=area].axis-y')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '关闭向导' }).click()
  await expect(page.locator('.setup-dialog')).toHaveCount(0)
})
