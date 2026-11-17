import { test, expect, type Page } from '@playwright/test'

async function holdResource(page: Page, style: string) {
  await page.addInitScript((value) => {
    localStorage.setItem('fufu:style', JSON.stringify(value))
    localStorage.setItem('fufu:openings', 'true')
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
  await expect(page.locator('.opening')).toHaveAttribute('data-loaded', '66')
  await expect(page.locator('.opening')).toHaveAttribute('data-progress', '64')
  return release
}

test('ZZZ reveals fixed blocks individually and waits for a real page module', async ({ page }) => {
  const release = await holdResource(page, 'zenless')
  const opening = page.locator('.opening')
  await expect(page.locator('.zone-segment.is-loaded')).toHaveCount(18)
  const before = await page.locator('.zone-segment').evaluateAll((items) =>
    items.map((item) => ({
      width: getComputedStyle(item).width,
      transform: getComputedStyle(item).transform,
    })),
  )
  expect(before.every((item) => item.transform === 'none')).toBe(true)
  await page.waitForTimeout(1000)
  await expect(opening).toHaveAttribute('data-phase', 'loading')
  await expect(page.locator('.zone-track')).toHaveAttribute('aria-valuenow', '64')
  await page.evaluate(() => {
    const counts: number[] = []
    Object.assign(window, { blockCounts: counts })
    const track = document.querySelector('.zone-track')!
    new MutationObserver(() => counts.push(track.querySelectorAll('.is-loaded').length)).observe(
      track,
      { subtree: true, attributes: true, attributeFilter: ['class'] },
    )
  })
  release()
  await expect(opening).toHaveAttribute('data-phase', 'complete')
  await expect(page.locator('.zone-segment.is-loaded')).toHaveCount(28)
  const after = await page.locator('.zone-segment').evaluateAll((items) =>
    items.map((item) => ({
      width: getComputedStyle(item).width,
      transform: getComputedStyle(item).transform,
    })),
  )
  expect(after).toEqual(before)
  const counts = await page.evaluate(
    () => (window as unknown as { blockCounts: number[] }).blockCounts,
  )
  expect(counts).toEqual(Array.from({ length: 10 }, (_, index) => index + 19))
  await expect(opening).toHaveCount(0)
})

test('Genshin builds the road with element progress and only creates the gate when ready', async ({
  page,
}) => {
  const release = await holdResource(page, 'genshin')
  expect(
    await page
      .locator('.celestial-elements > span')
      .evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.element)),
  ).toEqual(['Pyro', 'Hydro', 'Anemo', 'Electro', 'Dendro', 'Cryo', 'Geo'])
  await expect(page.locator('.celestial-road-tile.is-built')).toHaveCount(9)
  await expect(page.locator('.celestial-elements .is-loaded')).toHaveCount(4)
  await expect(page.locator('.celestial-gate')).toHaveCount(0)
  await page.waitForTimeout(1000)
  await expect(page.locator('.opening')).toHaveAttribute('data-phase', 'loading')
  await expect(page.locator('.celestial-gate')).toHaveCount(0)
  release()
  await expect(page.locator('.opening')).toHaveAttribute('data-phase', 'complete')
  await expect(page.locator('.celestial-road-tile.is-built')).toHaveCount(14)
  await expect(page.locator('.celestial-elements .is-loaded')).toHaveCount(7)
  await expect(page.locator('.celestial-gate')).toHaveCount(1)
  await page.waitForTimeout(1050)
  const door = await page.locator('.gate-left').evaluate((item) => getComputedStyle(item).transform)
  expect(door).toContain('matrix3d')
  await expect(page.locator('.opening')).toHaveCount(0)
})

test('Endfield fades a full yellow cover over the ready but inert page', async ({ page }) => {
  const release = await holdResource(page, 'endfield')
  await expect(page.locator('.endfield-percent')).toHaveText('%')
  const percent = await page.locator('.endfield-percent').evaluate((item) => ({
    size: parseFloat(getComputedStyle(item).fontSize),
    numberSize: parseFloat(getComputedStyle(item.parentElement!).fontSize),
    color: getComputedStyle(item).color,
  }))
  expect(percent.size).toBeLessThan(percent.numberSize / 2)
  expect(percent.color).toBe('rgb(255, 250, 0)')
  release()
  await expect(page.locator('.opening')).toHaveAttribute('data-phase', 'exiting')
  await page.waitForTimeout(180)
  const state = await page.evaluate(() => ({
    opacity: Number(getComputedStyle(document.querySelector('.opening')!).opacity),
    cover: getComputedStyle(document.querySelector('.endfield-yellow-wipe')!).transform,
    yellow: getComputedStyle(document.querySelector('.endfield-yellow-wipe')!).backgroundColor,
    visible: getComputedStyle(document.querySelector('.app-shell')!).visibility,
    inert: document.querySelector('.app-shell')!.hasAttribute('inert'),
  }))
  expect(state.opacity).toBeGreaterThan(0)
  expect(state.opacity).toBeLessThan(1)
  expect(state.cover).toBe('matrix(1, 0, 0, 1, 0, 0)')
  expect(state.yellow).toBe('rgb(255, 250, 0)')
  expect(state.visible).toBe('visible')
  expect(state.inert).toBe(true)
  await expect(page.locator('.opening')).toHaveCount(0)
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert')
})

test('resource failure keeps progress incomplete and offers a keyboard-accessible reload', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('fufu:style', '"zenless"'))
  await page.route('**/favicon.svg', (route) => route.fulfill({ status: 503, body: 'Unavailable' }))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('部分界面资源未能加载')
  await page.waitForTimeout(1000)
  await expect(page.locator('.opening')).toHaveAttribute('data-phase', 'loading')
  expect(Number(await page.locator('.opening').getAttribute('data-progress'))).toBeLessThan(100)
  await expect(page.getByRole('button', { name: '跳过' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '重新加载' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.opening')).toHaveCount(0)
  await expect(page.locator('.category-card')).toHaveCount(5)
})
