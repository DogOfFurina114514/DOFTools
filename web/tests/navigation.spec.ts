import { test, expect } from '@playwright/test'

test('clean addresses support direct links, reload, history and legacy bookmarks', async ({
  page,
}) => {
  await page.goto('/settings/')
  await expect(page.getByRole('radiogroup', { name: '普通主题' })).toBeVisible()
  await expect(page).toHaveURL('http://127.0.0.1:5173/settings')
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '音频工具' })
    .click()
  await expect(page).toHaveURL('http://127.0.0.1:5173/category/audio')
  await page.reload()
  await expect(page.getByRole('heading', { name: '音频工具' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL('http://127.0.0.1:5173/settings')
  await page.goto('/?__route=' + encodeURIComponent('/category/video?source=direct'))
  await expect(page.getByRole('heading', { name: '视频工具' })).toBeVisible()
  await expect(page).toHaveURL('http://127.0.0.1:5173/category/video?source=direct')
  await page.goto('/#/settings')
  await expect(page.getByRole('radiogroup', { name: '普通主题' })).toBeVisible()
  await expect(page).toHaveURL('http://127.0.0.1:5173/settings')
})
