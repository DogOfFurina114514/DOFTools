import { test, expect, type Page } from '@playwright/test'
import { selectChoice } from './helpers/controls'

async function mount(page: Page) {
  await page.goto('/settings')
  await page.evaluate(async () => {
    const { mountControls } = await import('/tests/fixtures/controls.tsx')
    mountControls()
  })
  return page.locator('#controls-fixture')
}

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
  test(`${style}: drawn dropdown and shared values survive theme changes`, async ({ page }) => {
    await page.addInitScript((style) => {
      localStorage.setItem('fufu:style', JSON.stringify(style))
      localStorage.setItem('fufu:openings', 'false')
    }, style)
    const fixture = await mount(page)
    await fixture.getByRole('textbox', { name: '输出名称' }).fill('sample')
    await selectChoice(fixture.getByRole('combobox', { name: '输出格式' }), 'jpg')
    await fixture.getByRole('checkbox').click()
    const trigger = fixture.getByRole('combobox', { name: '输出格式' })
    await trigger.click()
    await expect(page.getByRole('listbox')).toBeVisible()
    await expect(
      page.locator(
        'select, option, dialog, input[type="range"], input[type="checkbox"], input[type="number"]',
      ),
    ).toHaveCount(0)
    await expect(trigger).toHaveJSProperty('tagName', 'BUTTON')
    await page.screenshot({ path: `test-results/controls-${style}.png`, fullPage: true })
    await page.keyboard.press('Escape')
    await fixture.getByRole('button', { name: '切换 Material 控件' }).click()
    await fixture.getByRole('button', { name: '切换 Fluent 控件' }).click()
    await expect(fixture.getByRole('textbox', { name: '输出名称' })).toHaveValue('sample')
    await expect(trigger).toHaveAttribute('data-value', 'jpg')
    await expect(fixture.getByRole('checkbox')).toBeChecked()
    await fixture.getByRole('button', { name: '查看当前值' }).click()
    await expect(page.getByRole('dialog', { name: '当前设置' })).toContainText('sample|jpg|true')
    await page.keyboard.press('Escape')
    await expect(fixture.getByRole('button', { name: '查看当前值' })).toBeFocused()
  })
}

test('dropdown keyboard search, cancel, navigation and disabled behavior', async ({ page }) => {
  const fixture = await mount(page)
  const trigger = fixture.getByRole('combobox', { name: '输出格式' })
  await trigger.focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.press('Escape')
  await expect(trigger).toHaveAttribute('data-value', 'png')
  await expect(trigger).toBeFocused()
  await page.keyboard.press('j')
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('data-value', 'jpg')
  await trigger.click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('data-value', 'png')
  await trigger.click()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(fixture.getByRole('checkbox')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(fixture.getByRole('checkbox')).toBeChecked()
  await expect(fixture.getByRole('combobox', { name: '禁用选择' })).toBeDisabled()
})

test('decimal editing and drawn slider respond to keyboard and dragging', async ({ page }) => {
  const fixture = await mount(page)
  const number = fixture.getByRole('spinbutton', { name: '小数' })
  await number.fill('1.')
  await expect(number).toHaveValue('1.')
  await number.type('7')
  await expect(number).toHaveAttribute('aria-valuenow', '1.7')
  await page.keyboard.press('ArrowUp')
  await expect(number).toHaveValue('1.8')
  await number.fill('invalid')
  await expect(number).toHaveValue('invalid')
  await expect(number).not.toHaveAttribute('aria-valuenow')
  await expect(number).toHaveAttribute('aria-invalid', 'true')
  await number.fill('1e')
  await expect(number).toHaveValue('1e')
  await number.type('0')
  await expect(number).toHaveAttribute('aria-valuenow', '1')
  await number.fill('99')
  await fixture.getByRole('button', { name: '查看当前值' }).focus()
  await expect(number).toHaveValue('10')
  await fixture.getByRole('button', { name: '减少 小数' }).click()
  await expect(number).toHaveValue('9.9')
  const slider = fixture.getByRole('slider', { name: '测试滑块' })
  await slider.focus()
  await page.keyboard.press('End')
  await expect(slider).toHaveAttribute('aria-valuenow', '100')
  await page.keyboard.press('PageDown')
  await expect(slider).toHaveAttribute('aria-valuenow', '90')
  const rect = (await slider.boundingBox())!
  await page.mouse.move(rect.x + rect.width - 10, rect.y + rect.height / 2)
  await page.mouse.down()
  await page.mouse.move(rect.x + 10, rect.y + rect.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(slider).toHaveAttribute('aria-valuenow', '0')
})

test('portal dialogs trap focus, support dropdowns and restore nested focus without native dialog API', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { value: undefined }),
  )
  const fixture = await mount(page)
  await fixture.getByRole('button', { name: '查看当前值' }).click()
  const dialog = page.getByRole('dialog', { name: '当前设置' })
  const close = dialog.getByRole('button', { name: '关闭弹窗' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: '嵌套弹窗' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await selectChoice(dialog.getByRole('combobox'), 'jpg')
  await dialog.getByRole('combobox').click()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await dialog.evaluate((element) => {
    element.style.height = '250px'
    const spacer = document.createElement('div')
    spacer.style.height = '700px'
    element.appendChild(spacer)
  })
  await dialog.getByRole('combobox').click()
  await dialog.evaluate((element) => {
    element.scrollTop = 200
  })
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await dialog.getByRole('button', { name: '嵌套弹窗' }).click()
  await expect(page.getByRole('dialog', { name: '第二层' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '第二层' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '嵌套弹窗' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(fixture.getByRole('button', { name: '查看当前值' })).toBeFocused()
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
})

test('long dropdown follows transforms and its custom scrollbar stays usable', async ({ page }) => {
  const fixture = await mount(page)
  const trigger = fixture.getByRole('combobox', { name: '长列表' })
  await trigger.click()
  const popup = page.getByRole('listbox')
  await expect(popup.getByRole('option', { name: 'Item 29', exact: true })).toBeInViewport()
  await fixture.evaluate((element) => {
    element.style.transform = 'translateX(-30px)'
  })
  await expect
    .poll(async () => {
      const a = (await trigger.boundingBox())!,
        b = (await popup.boundingBox())!
      return Math.abs(a.x - b.x)
    })
    .toBeLessThan(1)
  const rail = page.getByRole('scrollbar').filter({ has: page.locator('.themed-scroll-thumb') })
  const listId = await popup.getAttribute('id')
  const listRail = rail.and(page.locator(`[aria-controls="${listId}"]`))
  await expect(listRail).toHaveCount(1)
  const bounds = (await listRail.boundingBox())!
  await page.mouse.click(bounds.x + 3, bounds.y + 12)
  await expect(popup).toBeVisible()
  await expect.poll(() => popup.evaluate((element) => element.scrollTop)).toBeLessThan(100)
  await fixture.getByRole('textbox', { name: '输出名称' }).click()
  await expect(popup).toHaveCount(0)
  await expect(listRail).toHaveCount(0)
})

test.describe('touch controls', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test('dropdown flips above a low trigger, fits the viewport and selects by touch', async ({
    page,
  }) => {
    const fixture = await mount(page)
    const trigger = fixture.getByRole('combobox', { name: '长列表' })
    await trigger.evaluate((element) => {
      Object.assign(element.style, {
        position: 'fixed',
        bottom: '8px',
        right: '8px',
        width: '250px',
      })
    })
    await trigger.tap()
    const popup = page.getByRole('listbox')
    await expect(popup).toBeVisible()
    const a = (await trigger.boundingBox())!,
      b = (await popup.boundingBox())!
    expect(b.y + b.height).toBeLessThan(a.y)
    expect(b.x).toBeGreaterThanOrEqual(8)
    expect(b.x + b.width).toBeLessThanOrEqual(382)
    await popup.getByRole('option', { name: 'Item 28', exact: true }).tap()
    await expect(trigger).toHaveAttribute('data-value', '28')
    await expect(popup).toHaveCount(0)
    const slider = fixture.getByRole('slider', { name: '测试滑块' })
    await slider.scrollIntoViewIfNeeded()
    const rect = (await slider.boundingBox())!
    await page.touchscreen.tap(rect.x + rect.width - 10, rect.y + rect.height / 2)
    await expect(slider).toHaveAttribute('aria-valuenow', '100')
    await page.screenshot({ path: 'test-results/controls-mobile.png', fullPage: true })
  })
})
