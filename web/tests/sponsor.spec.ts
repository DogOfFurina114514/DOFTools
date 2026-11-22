import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
)
const repository = 'https://github.com/DogOfFurina114514/DOFTools'
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: 'http://127.0.0.1:5173',
        localStorage: [
          { name: 'fufu:onboarded', value: 'true' },
          { name: 'fufu:sponsor-reminders-disabled', value: 'false' },
        ],
      },
    ],
  },
})
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fufu:openings', 'false')
  })
})
async function runImage(page: Page) {
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
}
test('completion waits for an existing dialog and repeated completions do not stack reminders', async ({
  page,
}) => {
  await page.goto('/settings')
  await page.locator('.topbar').getByRole('button', { name: '使用指南', exact: true }).click()
  const complete = () =>
    page.evaluate(async () => {
      const path = '/src/tools/registry.ts'
      const { ToolRegistry } = await import(path)
      const registry = new ToolRegistry()
      const text = { 'zh-CN': '完成', en: 'Done' }
      registry.register({
        id: 'sponsor-fixture',
        title: text,
        description: text,
        tags: ['other'],
        fields: [],
        initialValues: {},
        inputSchema: { type: 'object' },
        execute: async () => ({ summary: text }),
      })
      await registry.run(
        'sponsor-fixture',
        {},
        { locale: 'en', signal: new AbortController().signal, onProgress: () => {} },
      )
    })
  await complete()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'help-title')
  await page.getByRole('button', { name: '开始逛逛' }).click()
  await expect(page.getByRole('dialog', { name: '赞助 · 支持开发' })).toBeVisible()
  await complete()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
})
for (const style of [
  'default',
  'material',
  'fluent',
  'glass',
  'genshin',
  'zenless',
  'endfield',
  'minecraft',
]) {
  test(`${style}: drawn sponsor dialog, parallel payment codes and compact bilingual header`, async ({
    page,
  }) => {
    await page.addInitScript(
      (style) => localStorage.setItem('fufu:style', JSON.stringify(style)),
      style,
    )
    await page.goto('/')
    const trigger = page.getByRole('button', { name: '赞助', exact: true })
    expect(
      await trigger.evaluate((button) =>
        button.nextElementSibling?.classList.contains('language-slider'),
      ),
    ).toBe(true)
    expect(await trigger.evaluate((button) => getComputedStyle(button).borderWidth)).toBe('0px')
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: '赞助 · 支持开发' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: '不再提示', exact: true })).toHaveCount(0)
    const images = dialog.locator('img')
    await expect(images).toHaveCount(2)
    await expect
      .poll(() =>
        images.evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 1000),
        ),
      )
      .toBe(true)
    const paymentBoxes = await dialog.locator('.sponsor-payment').evaluateAll((cards) =>
      cards.map((card) => ({
        x: card.getBoundingClientRect().x,
        y: card.getBoundingClientRect().y,
      })),
    )
    expect(paymentBoxes[0].y).toBe(paymentBoxes[1].y)
    expect(paymentBoxes[0].x).toBeLessThan(paymentBoxes[1].x)
    await expect(dialog.getByRole('link', { name: '点个 Star' })).toHaveAttribute(
      'href',
      repository,
    )
    await expect(page.locator('dialog')).toHaveCount(0)
    await page.screenshot({ path: `test-results/sponsor-${style}-desktop.png` })
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    for (const english of [false, true]) {
      if (english) await page.getByRole('button', { name: 'English', exact: true }).click()
      await page.setViewportSize({ width: 320, height: 740 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      expect(
        await page.locator('.topbar-actions').evaluate((element) => {
          const box = element.getBoundingClientRect()
          return box.x >= 0 && box.right <= innerWidth
        }),
      ).toBe(true)
      const sponsor = page.getByRole('button', { name: english ? 'Sponsor' : '赞助', exact: true })
      await expect(sponsor).toBeInViewport()
      await sponsor.click()
      const modal = page.getByRole('dialog')
      const cards = await modal
        .locator('.sponsor-payment')
        .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().y))
      expect(cards[0]).toBe(cards[1])
      expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      )
      await expect(
        modal.getByRole('link', { name: english ? 'Star on GitHub' : '点个 Star' }),
      ).toBeInViewport()
      await page.screenshot({
        path: `test-results/sponsor-${style}-${english ? 'en' : 'zh'}-mobile.png`,
      })
      await page.keyboard.press('Escape')
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
    }
  })
}
test('success prompts after completion, dismissal survives reload and manual access remains', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tool/image-convert')
  await runImage(page)
  const dialog = page.getByRole('dialog', { name: '赞助 · 支持开发' })
  await expect(dialog).toContainText('工具已成功运行')
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: '不再提示', exact: true })).toBeInViewport()
  await page.screenshot({ path: 'test-results/sponsor-automatic-mobile.png' })
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await runImage(page)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '不再提示', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('已关闭')
  await page.reload()
  await runImage(page)
  const download = page.waitForEvent('download')
  await page.locator('.ui-result').getByRole('button').first().click()
  expect((await readFile(await (await download).path())).length).toBeGreaterThan(20)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('opt-out persists across page reloads and other tabs; Star opens the repository', async ({
  context,
  page,
}) => {
  await page.goto('/tool/image-convert')
  await runImage(page)
  const other = await context.newPage()
  await other.goto('/tool/image-convert')
  await runImage(other)
  await expect(other.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '不再提示', exact: true }).click()
  await expect(other.getByRole('dialog')).toHaveCount(0)
  await other.reload()
  await runImage(other)
  await expect(other.locator('.ui-result')).toBeVisible()
  const download = other.waitForEvent('download')
  await other.locator('.ui-result').getByRole('button').first().click()
  expect((await readFile(await (await download).path())).length).toBeGreaterThan(20)
  await expect(other.getByRole('dialog')).toHaveCount(0)
  await other.getByRole('button', { name: '赞助', exact: true }).click()
  await expect(other.getByRole('dialog')).toBeVisible()
  await context.route(repository, (route) =>
    route.fulfill({ body: '<h1>Repository</h1>', contentType: 'text/html' }),
  )
  const popup = other.waitForEvent('popup')
  await other.getByRole('link', { name: '点个 Star' }).click()
  const destination = await popup
  await destination.waitForLoadState('domcontentloaded')
  expect(destination.url()).toBe(repository)
})
test('failed conversion does not ask for sponsorship and supplied originals remain exact', async ({
  page,
  request,
}) => {
  await page.goto('/tool/image-convert')
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid') })
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.locator('.error-message')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  for (const name of ['alipay', 'wechat']) {
    const response = await request.get(`/sponsor/${name}.png`)
    expect(response.ok()).toBe(true)
    expect(await response.body()).toEqual(
      await readFile(new URL(`../public/sponsor/${name}.png`, import.meta.url)),
    )
  }
})
