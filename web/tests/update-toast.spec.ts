import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fufu:openings', 'false')
    sessionStorage.setItem('loads', String(Number(sessionStorage.getItem('loads')) + 1))
  })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: '手动检测资源', exact: true })).toBeVisible()
  await page.clock.install()
})

function completed(page: Page, updated: boolean) {
  return page.evaluate(
    (updated) =>
      window.dispatchEvent(
        new CustomEvent('offline-ready', {
          detail: { version: '26.1.5', updated },
        }),
      ),
    updated,
  )
}

test('updated resources refresh after five seconds, with a visible mobile cancel action', async ({
  page,
}) => {
  await completed(page, true)
  await expect(page.locator('.resource-update-toast')).toContainText('5 秒后自动刷新')
  await expect(page.getByRole('button', { name: '取消刷新', exact: true })).toBeInViewport()
  await page.clock.runFor(4000)
  await expect(page.locator('.resource-update-toast')).toContainText('1 秒后自动刷新')
  expect(await page.evaluate(() => sessionStorage.getItem('loads'))).toBe('1')
  const reloaded = page.waitForEvent('domcontentloaded')
  await page.clock.runFor(1000)
  await reloaded
  expect(await page.evaluate(() => sessionStorage.getItem('loads'))).toBe('2')
})

test('cancel stops the timer and later notifications cannot hide a pending update', async ({
  page,
}) => {
  await completed(page, true)
  await page.evaluate(() => window.dispatchEvent(new Event('models-ready')))
  await expect(page.locator('.resource-update-toast')).toBeVisible()
  await page.clock.runFor(3000)
  await page.getByRole('button', { name: '取消刷新', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('已取消自动刷新')
  await page.clock.runFor(7000)
  expect(await page.evaluate(() => sessionStorage.getItem('loads'))).toBe('1')
  await expect(page.locator('.resource-update-toast')).toHaveCount(0)
})

test('initial save notifies without refreshing or showing a cancel button', async ({ page }) => {
  await completed(page, false)
  await expect(page.locator('.toast')).toContainText('离线资源已保存')
  await expect(page.getByRole('button', { name: '取消刷新', exact: true })).toHaveCount(0)
  await page.clock.runFor(6000)
  expect(await page.evaluate(() => sessionStorage.getItem('loads'))).toBe('1')
})

test('offline settings show Offline immediately and keep manual detection available', async ({
  page,
  context,
}) => {
  await context.setOffline(true)
  await expect(page.locator('.resource-status strong')).toHaveText(['离线', '离线'])
  await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '手动检测资源', exact: true })).toBeEnabled()
  await context.setOffline(false)
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await context.setOffline(true)
  await expect(page.locator('.resource-status strong')).toHaveText(['Offline', 'Offline'])
})
