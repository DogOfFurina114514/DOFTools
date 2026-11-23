import { expect, test } from '@playwright/test'
import { selectChoice } from './helpers/controls'

const games = ['genshin', 'zenless', 'endfield', 'minecraft']
const scenes = [
  { width: 1440, height: 1000, theme: 'light', locale: 'zh-CN' },
  { width: 1440, height: 1000, theme: 'dark', locale: 'en' },
  { width: 390, height: 844, theme: 'dark', locale: 'zh-CN' },
  { width: 390, height: 844, theme: 'light', locale: 'en' },
]

for (const style of games)
  for (const scene of scenes) {
    test(`${style} ${scene.width} ${scene.theme} ${scene.locale}: themed navigation, filters and workbench stay usable`, async ({
      page,
    }) => {
      test.setTimeout(60000)
      await page.setViewportSize(scene)
      await page.addInitScript(
        ({ style, scene }) => {
          localStorage.setItem('fufu:style', JSON.stringify(style))
          localStorage.setItem('fufu:theme', JSON.stringify(scene.theme))
          localStorage.setItem('fufu:language', JSON.stringify(scene.locale))
          localStorage.setItem('fufu:openings', 'false')
          localStorage.setItem('fufu:scene-motion', 'false')
        },
        { style, scene },
      )
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const en = scene.locale === 'en'
      const checkWidth = async () =>
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
      await page.goto('/')
      await expect(page.locator('.game-dashboard h1')).toBeVisible()
      await expect(page.locator('.game-tag-link')).toHaveCount(7)
      await expect(page.locator('.game-tool-link')).toHaveCount(6)
      await expect(page.locator('.theme-scenery')).toHaveAttribute('aria-hidden', 'true')
      await checkWidth()
      await page
        .getByRole('link', { name: en ? 'Open all tools' : '打开所有工具', exact: true })
        .click()
      await expect(page.locator('.tool-list-card')).toHaveCount(17)
      const filters = page.getByRole('group', { name: en ? 'Filter by tags' : '标签筛选' })
      await filters.getByRole('button', { name: en ? /^Video/ : /^视频/ }).click()
      await filters.getByRole('button', { name: en ? /^Parsing/ : /^解析/ }).click()
      await expect(page.locator('.tool-list-card')).toHaveCount(1)
      await expect(page.locator('.tool-list-link')).toHaveAttribute('href', '/tool/social-link')
      await page.getByRole('button', { name: en ? 'Clear tags' : '清除标签', exact: true }).click()
      await page
        .getByRole('searchbox', { name: en ? 'Search keywords' : '搜索关键词' })
        .fill('replace video audio')
      await expect(page.locator('.tool-list-card')).toHaveCount(1)
      await page.locator('.tool-list-card .pin-tool-button').click()
      await checkWidth()
      await page.locator('.tool-list-link').click()
      await expect(page.locator('.workspace-output-empty')).toBeVisible()
      await selectChoice(
        page.getByRole('combobox', { name: en ? 'Output format' : '输出格式', exact: true }),
        'webm',
      )
      await page.getByRole('button', { name: en ? 'Run tool' : '开始处理', exact: true }).click()
      await expect(page.locator('.error-message')).toBeVisible()
      await checkWidth()
      if (style === 'endfield' && scene.width > 800) {
        const layout = await page.evaluate(() => {
          const input = document.querySelector('.workspace-input')!.getBoundingClientRect()
          const output = document.querySelector('.workspace-output')!.getBoundingClientRect()
          return { inputRight: input.right, outputLeft: output.left }
        })
        expect(layout.outputLeft).toBeGreaterThan(layout.inputRight)
      }
      if (scene.width < 800) {
        await page
          .getByRole('button', { name: en ? 'Open navigation' : '打开导航', exact: true })
          .click()
        await expect
          .poll(() =>
            page.locator('.sidebar').evaluate((element) => element.getBoundingClientRect().left),
          )
          .toBeGreaterThanOrEqual(-0.5)
        await expect(page.locator('.pinned-tools a')).toHaveCount(1)
        await page
          .getByRole('button', { name: en ? 'Close navigation' : '关闭导航', exact: true })
          .click({ position: { x: scene.width - 16, y: scene.height / 2 } })
        await expect(page.locator('.sidebar')).not.toHaveClass(/mobile-open/)
      }
      if (scene.theme === 'light' && scene.width > 800) {
        await page.goto('/tool/image-compress')
        const bytes = await page.evaluate(async () => {
          const canvas = document.createElement('canvas')
          canvas.width = 40
          canvas.height = 24
          const context = canvas.getContext('2d')!
          context.fillStyle = '#279a62'
          context.fillRect(0, 0, 40, 24)
          const blob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)))
          return Array.from(new Uint8Array(await blob.arrayBuffer()))
        })
        await page
          .locator('input[type=file]')
          .setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from(bytes) })
        await page.getByRole('button', { name: '开始处理', exact: true }).click()
        await expect(page.locator('.ui-result')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('.workspace-output-empty')).toHaveCount(0)
        await expect(page.locator('.ui-result .button')).toHaveCount(1)
        await checkWidth()
      }
      expect(errors).toEqual([])
    })
  }

test('terrain changes over time, the scenery switch persists, and reduced motion stops it', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    localStorage.setItem('fufu:style', '"endfield"')
    localStorage.setItem('fufu:openings', 'false')
  })
  await page.goto('/settings')
  const image = () =>
    page.locator('.terrain-contours').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
  const first = await image()
  await expect.poll(image).not.toBe(first)
  const toggle = page.getByRole('switch', { name: '动态主题背景', exact: true })
  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-scene-motion', 'off')
  const stopped = await image()
  await page.waitForTimeout(250)
  expect(await image()).toBe(stopped)
  await page.reload()
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('html')).toHaveAttribute('data-scene-motion', 'off')
  const reduced = await image()
  await page.waitForTimeout(250)
  expect(await image()).toBe(reduced)
})

for (const style of ['default', 'material', 'fluent', 'glass']) {
  test(`${style}: standard themes retain the regular dashboard and tool controls`, async ({
    page,
  }) => {
    await page.addInitScript(
      (style) => localStorage.setItem('fufu:style', JSON.stringify(style)),
      style,
    )
    await page.goto('/')
    await expect(page.locator('.welcome-heading')).toBeVisible()
    await expect(page.locator('.theme-scenery')).toHaveCount(0)
    await page.goto('/tool/image-compress')
    await expect(page.getByRole('button', { name: '开始处理', exact: true })).toBeVisible()
    await expect(page.locator('.workspace-output-empty')).toHaveCount(0)
  })
}
