import { test, expect } from '@playwright/test'

for (const style of ['genshin', 'zenless', 'endfield', 'minecraft']) {
  test(`${style} covers the first paint and never exposes the page during its opening`, async ({
    page,
  }) => {
    await page.addInitScript((style) => {
      localStorage.setItem('fufu:style', JSON.stringify(style))
      localStorage.setItem('fufu:openings', 'true')
      const samples: { covered: boolean; webpageVisible: boolean; opacity: string }[] = []
      Object.assign(window, { openingSamples: samples })
      const sample = () => {
        const boot = document.querySelector('#boot-opening')
        const opening = document.querySelector('.opening')
        const shell = document.querySelector('.app-shell')
        const visible = (element: Element | null) =>
          !!element &&
          getComputedStyle(element).visibility !== 'hidden' &&
          getComputedStyle(element).display !== 'none'
        if (boot && (visible(boot) || opening))
          samples.push({
            covered: visible(boot) || visible(opening),
            webpageVisible: visible(shell),
            opacity: opening ? getComputedStyle(opening).opacity : '1',
          })
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    }, style)
    await page.route('**/src/main.tsx', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      await route.continue()
    })
    await page.goto('/', { waitUntil: 'commit' })
    await expect(page.locator('#boot-opening')).toBeVisible()
    await expect(page.locator('.opening')).toBeVisible()
    await expect(page.locator('.app-shell')).toBeHidden()
    await page.waitForTimeout(350)
    const samples = await page.evaluate(
      () =>
        (
          window as unknown as {
            openingSamples: { covered: boolean; webpageVisible: boolean; opacity: string }[]
          }
        ).openingSamples,
    )
    expect(samples.length).toBeGreaterThan(3)
    expect(
      samples.every((sample) => sample.covered && !sample.webpageVisible && sample.opacity === '1'),
    ).toBe(true)
    await page.getByRole('button', { name: '跳过' }).click()
    await expect(page.locator('.app-shell')).toBeVisible()
  })
}
