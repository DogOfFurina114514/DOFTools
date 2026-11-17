import { test, expect } from '@playwright/test'

test('shared controls keep their values when switching to native Material components', async ({
  page,
}) => {
  await page.goto('/settings')
  await page.evaluate(async () => {
    const { mountControls } = await import('/tests/fixtures/controls.tsx')
    mountControls()
  })
  const fixture = page.locator('#controls-fixture')
  await fixture.getByRole('textbox', { name: '输出名称' }).fill('sample')
  await fixture.getByRole('combobox', { name: '输出格式' }).selectOption('jpg')
  await fixture.getByRole('checkbox', { name: '保留元数据' }).check()
  await fixture.getByRole('button', { name: '切换原生控件' }).click()
  await expect(fixture.locator('md-outlined-text-field')).toBeVisible()
  await fixture.getByRole('textbox', { name: '输出名称' }).fill('material')
  await fixture.getByRole('combobox', { name: '输出格式' }).click()
  await fixture.getByRole('option', { name: 'PNG', exact: true }).click()
  await fixture.locator('md-checkbox').click()
  await fixture.getByRole('button', { name: '查看当前值' }).click()
  await expect(fixture.getByRole('dialog', { name: '当前设置' })).toBeVisible()
  await expect(fixture.getByText('material|png|false')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(fixture.getByRole('dialog', { name: '当前设置' })).not.toBeVisible()
})
