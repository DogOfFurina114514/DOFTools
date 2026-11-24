import { expect, test } from '@playwright/test'
import { selectChoice } from './helpers/controls'

async function useTheme(page: import('@playwright/test').Page, style: string, fallback = false) {
  await page.addInitScript(
    ({ style, fallback }) => {
      localStorage.setItem('fufu:style', JSON.stringify(style))
      localStorage.setItem('fufu:openings', 'false')
      localStorage.setItem('fufu:scene-motion', 'false')
      if (fallback) Object.defineProperty(document, 'startViewTransition', { value: undefined })
    },
    { style, fallback },
  )
}

test('every Genshin route uses one persistent binding and retains tool and AI controls', async ({
  page,
}) => {
  await useTheme(page, 'genshin')
  await page.goto('/')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.locator('.book-verso')).toBeVisible()
  await expect(page.locator('.bookmarks-heading')).toHaveText('书签')
  await page
    .locator('.book-binding')
    .evaluate((element) => element.setAttribute('data-persistent', 'yes'))
  const topbar = await page.locator('.topbar').boundingBox()

  await page.locator('.all-tools-nav').click()
  await expect(page.locator('.tool-list-card')).toHaveCount(17)
  await page.getByRole('searchbox', { name: '搜索关键词' }).fill('image compress')
  await expect(page.locator('.tool-list-card')).toHaveCount(1)
  await expect(page.locator('.book-binding')).toHaveAttribute('data-persistent', 'yes')
  await page.locator('.tool-list-link').click()
  await expect(page.getByRole('button', { name: '开始处理', exact: true })).toBeVisible()
  await expect(page.locator('.book-chapter-reference')).toContainText('图片压缩')
  await page.locator('.sidebar a[href="/ai"]').click()
  await expect(page.locator('.ai-workspace')).toBeVisible()
  await selectChoice(page.getByRole('combobox', { name: '思考强度', exact: true }), 'high')
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('fufu:ai-thinking')))
    .toBe('"high"')
  await page.locator('.sidebar a[href="/settings"]').click()
  await expect(page.getByRole('switch', { name: '切页动画', exact: true })).toBeVisible()
  await expect(page.locator('.book-binding')).toHaveAttribute('data-persistent', 'yes')
  await expect(page.locator('.topbar')).toHaveJSProperty('offsetHeight', topbar!.height)
  await expect(page.locator('.book-chapter-reference')).toContainText('设置与外观')
  await page.evaluate(() => history.pushState(null, '', '/missing-page'))
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')))
  await expect(page.locator('.book-chapter-reference')).toContainText('附录')
  expect(errors).toEqual([])
})

test('many ribbon bookmarks scroll without shrinking links, pins or the footer', async ({
  page,
}) => {
  await useTheme(page, 'genshin')
  await page.setViewportSize({ width: 1440, height: 760 })
  await page.goto('/tools')
  await expect(page.locator('.tool-list-card')).toHaveCount(17)
  const ids = await page
    .locator('.tool-list-link')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')!.slice(6)))
  await page.evaluate((ids) => localStorage.setItem('fufu:pinned-tools', JSON.stringify(ids)), ids)
  await page.reload()
  await expect(page.locator('.pinned-tool-row')).toHaveCount(17)
  const dimensions = await page.evaluate(() => {
    const nav = document.querySelector('.sidebar-nav')!
    const sidebar = document.querySelector('.sidebar')!
    return {
      links: [...document.querySelectorAll('.pinned-tool-row a')].map(
        (link) => link.getBoundingClientRect().height,
      ),
      navScrolls: nav.scrollHeight > nav.clientHeight,
      sidebarScrolls: sidebar.scrollHeight > sidebar.clientHeight,
      footerBottom: document.querySelector('.sidebar-bottom')!.getBoundingClientRect().bottom,
      clipped: getComputedStyle(document.querySelector('.pinned-tool-row a')!).clipPath,
    }
  })
  expect(dimensions.links.every((height) => height >= 48)).toBe(true)
  expect(dimensions.navScrolls).toBe(true)
  expect(dimensions.sidebarScrolls).toBe(false)
  expect(dimensions.footerBottom).toBeLessThanOrEqual(760)
  expect(dimensions.clipped).toBe('none')
  await page.locator('.pinned-tool-row').last().locator('a').click()
  await expect(page.locator('.registered-tool-nav')).toBeVisible()
})

for (const style of ['genshin', 'endfield']) {
  test(`${style}: snapshot layers follow the route, respect back and clean up after cancellation`, async ({
    page,
  }) => {
    await useTheme(page, style)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    await page.locator('.all-tools-nav').click()
    await expect(page.locator('html')).toHaveAttribute('data-route-transition', style)
    const material = page.locator(
      style === 'genshin' ? '.book-turn-material' : '.terminal-scan-material',
    )
    await expect(material).toHaveAttribute('aria-hidden', 'true')
    const bounds = await material.boundingBox()
    expect(bounds!.y).toBeGreaterThanOrEqual((await page.locator('.topbar').boundingBox())!.height)
    await expect(page.locator('.tool-list-card')).toHaveCount(17)
    await expect(material).toHaveCount(0)
    await page.goBack()
    await expect(page.locator('html')).toHaveAttribute('data-route-direction', 'back')
    await expect(page.locator('.game-dashboard')).toBeVisible()
    await expect(material).toHaveCount(0)
    // Interrupt a live snapshot without waiting for an animation to finish.
    await page.locator('.all-tools-nav').click()
    await expect(material).toHaveCount(1)
    await page
      .locator('.sidebar a[href="/settings"]')
      .evaluate((link: HTMLAnchorElement) => link.click())
    await expect(page.getByRole('switch', { name: '切页动画', exact: true })).toBeVisible()
    await expect(material).toHaveCount(0)
    await expect(page.locator('html')).not.toHaveAttribute('data-route-transition')
    await page.getByRole('switch', { name: '切页动画', exact: true }).click()
    await page.locator('.all-tools-nav').click()
    await expect(page.locator('.tool-list-card')).toHaveCount(17)
    await expect(material).toHaveCount(0)
    await expect(page.locator('html')).not.toHaveAttribute('data-route-transition')
  })

  test(`${style}: fallback enters and reduced motion skips effects`, async ({ page }) => {
    await useTheme(page, style, true)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    await page.locator('.all-tools-nav').click()
    await expect(page.locator('.route-page')).toHaveAttribute('data-page-enter', style)
    await expect(page.locator('.route-page')).not.toHaveAttribute('data-page-enter')
    await expect(page.locator('.terminal-scan-material')).toHaveCount(0)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.locator('.sidebar a[href="/settings"]').click()
    await expect(page.getByRole('switch', { name: '切页动画', exact: true })).toBeVisible()
    await expect(page.locator('.route-page')).not.toHaveAttribute('data-page-enter')
    await expect(page.locator('.terminal-scan-material, .book-turn-material')).toHaveCount(0)
  })
}
