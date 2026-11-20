import { test, expect } from '@playwright/test'
import { selectChoice } from './helpers/controls'

test('settings and setup share the two ordered theme groups', async ({ page }) => {
  await page.goto('/settings')
  const standard = page.getByRole('radiogroup', { name: '普通主题' })
  const games = page.getByRole('radiogroup', { name: '游戏主题' })
  await expect(standard.getByRole('radio')).toHaveCount(4)
  expect(
    await standard
      .getByRole('radio')
      .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))),
  ).toEqual(['默认', 'Material 3', 'Fluent Design', '液态玻璃'])
  expect(
    await games
      .getByRole('radio')
      .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))),
  ).toEqual(['原神', '绝区零', '终末地', 'Minecraft'])
  await page.getByRole('button', { name: '重新打开向导' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.getByRole('dialog').getByRole('radio')).toHaveCount(8)
  await expect(standard).toBeVisible()
  await expect(games).toBeVisible()
})

test('Fluent keeps drawn controls and shared values through theme changes', async ({ page }) => {
  await page.goto('/settings')
  await page.evaluate(async () => {
    const { mountControls } = await import('/tests/fixtures/controls.tsx')
    mountControls()
  })
  const fixture = page.locator('#controls-fixture')
  await fixture.getByRole('textbox', { name: '输出名称' }).fill('sample')
  await selectChoice(fixture.getByRole('combobox', { name: '输出格式' }), 'jpg')
  await fixture.getByRole('checkbox', { name: '保留元数据' }).click()
  await fixture.getByRole('button', { name: '切换 Material 控件' }).click()
  await expect(fixture.getByRole('textbox', { name: '输出名称' })).toBeVisible()
  await fixture.getByRole('button', { name: '切换 Fluent 控件' }).click()
  await expect(fixture.locator('input[type="text"]').first()).toBeVisible()
  await expect(fixture.locator('button.ui-select-trigger').first()).toBeVisible()
  await expect(fixture.locator('button.ui-checkbox-control')).toBeVisible()
  await expect(fixture.getByRole('textbox', { name: '输出名称' })).toHaveValue('sample')
  await expect(fixture.getByRole('combobox', { name: '输出格式' })).toHaveAttribute(
    'data-value',
    'jpg',
  )
  await expect(fixture.getByRole('checkbox', { name: '保留元数据' })).toBeChecked()
  await fixture.getByRole('textbox', { name: '输出名称' }).fill('fluent')
  await selectChoice(fixture.getByRole('combobox', { name: '输出格式' }), 'png')
  await fixture.getByRole('checkbox', { name: '保留元数据' }).click()
  await fixture.getByRole('button', { name: '查看当前值' }).click()
  await expect(page.getByRole('dialog').getByText('fluent|png|false')).toBeVisible()
  await page.keyboard.press('Escape')
})

test('Minecraft blocks follow actual loading and the page stays inert until fade completes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('fufu:style', '"minecraft"')
    localStorage.setItem('fufu:openings', 'true')
  })
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/src/pages/AIPage.tsx*', async (route) => {
    await held
    await route.continue()
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.opening')).toHaveAttribute('data-progress', '64')
  await expect(page.locator('.minecraft-loading-grid .is-loaded')).toHaveCount(18)
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '')
  release()
  await expect(page.locator('.minecraft-loading-grid .is-loaded')).toHaveCount(28)
  await expect(page.locator('.opening')).toHaveCount(0, { timeout: 10_000 })
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert')
})
