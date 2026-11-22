import { expect, test } from '@playwright/test'

test('multiple tags use AND and search stays on the all-tools page', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.topbar .search-trigger')).toHaveCount(0)
  await page.locator('.all-tools-nav').click()
  await expect(page.locator('.tool-list-card')).toHaveCount(16)
  const filters = page.getByRole('group', { name: '标签筛选' })
  await filters.getByRole('button', { name: /^解析/ }).click()
  await expect(page.locator('.tool-list-card')).toHaveCount(2)
  await filters.getByRole('button', { name: /^视频/ }).click()
  await expect(page.locator('.tool-list-card')).toHaveCount(1)
  await expect(page.locator('.tool-list-card')).toContainText('社交平台解析')
  await page.reload()
  await expect(filters.getByRole('button', { name: /^解析/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('.tool-list-card')).toHaveCount(1)
  const search = page.getByRole('searchbox', { name: '搜索关键词' })
  await search.fill('网盘')
  await expect(page.getByRole('heading', { name: '没有匹配的工具' })).toBeVisible()
  await search.fill('YouTube')
  await expect(page.locator('.tool-list-card')).toHaveCount(1)
  await page.keyboard.press('Control+k')
  await expect(search).toBeFocused()
  await expect(search).toHaveValue('YouTube')
  await filters.getByRole('button', { name: '清除标签' }).click()
  await expect(page).not.toHaveURL(/tag=/)
})

test('pinning persists, opens with one click, and can be removed from the sidebar or workspace', async ({
  page,
}) => {
  await page.goto('/tools?tag=video&tag=parse')
  await page.getByRole('button', { name: '固定 社交平台解析 到侧边栏' }).click()
  await expect(page.locator('.pinned-tools a')).toHaveCount(1)
  await page.reload()
  await page.locator('.pinned-tools a').click()
  await expect(page).toHaveURL(/\/tool\/social-link$/)
  await page
    .locator('.registered-tool-nav')
    .getByRole('button', { name: '取消固定 社交平台解析' })
    .click()
  await expect(page.locator('.pinned-tools a')).toHaveCount(0)
  await page
    .locator('.registered-tool-nav')
    .getByRole('button', { name: '固定 社交平台解析 到侧边栏' })
    .click()
  await page.locator('.pinned-tools').getByRole('button', { name: '取消固定 社交平台解析' }).click()
  await page.reload()
  await expect(page.locator('.pinned-tools a')).toHaveCount(0)
})

test('nineteen social platforms resolve through GET with proxy notices and mobile wrapping', async ({
  page,
}) => {
  test.setTimeout(60000)
  const submitted: string[] = []
  await page.route('https://openapi.dwo.cc/api/svparse**', async (route) => {
    expect(route.request().method()).toBe('GET')
    submitted.push(new URL(route.request().url()).searchParams.get('url')!)
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: { type: 'video', title: '解析结果', url: 'https://cdn.example/video.mp4' },
      }),
    })
  })
  await page.goto('/tool/social-link')
  await expect(page.locator('.ui-panel-description')).toContainText('中国大陆用户需自备代理')
  await page
    .getByRole('textbox', { name: '视频或帖子链接 / 分享文案' })
    .fill(
      'https://b23.tv/Abcd\nhttps://v.douyin.com/Abcd/\nhttps://v.kuaishou.com/Abcd\nhttps://x.com/u/status/123\nhttps://youtu.be/jNQXAC9IVRw?tracking=' +
        'x'.repeat(500) +
        '\nhttps://vm.tiktok.com/Abcd/\nhttps://weixin.qq.com/sph/Abcd\nhttps://xhslink.com/o/Abcd\nhttps://www.instagram.com/reel/Abcd/\nhttps://v.ixigua.com/Abcd/\nhttps://haokan.baidu.com/v?vid=123\nhttps://h5.weishi.qq.com/weishi/feed/share.html?id=abc\nhttps://www.pearvideo.com/video_123\nhttps://www.acfun.cn/v/ac123\nhttps://www.zhihu.com/zvideo/123\nhttps://oasis.weibo.cn/v1/h5/share?sid=abc\nhttps://www.meipai.com/media/123\nhttps://quanmin.baidu.com/sv?source=share&vid=123\nhttps://v.huya.com/play/123.html',
    )
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.locator('.ui-result')).toContainText('已解析 19 / 19 个链接', { timeout: 45000 })
  await expect(page.locator('.share-preview')).toHaveCount(19)
  expect(submitted).toHaveLength(19)
  expect(submitted[4]).toContain('tracking=' + 'x'.repeat(500))
  await expect(page.locator('.ui-result')).not.toContainText('待接入')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.locator('.ui-result')).toContainText('Resolved 19 / 19 links')
  await expect(page.locator('.ui-panel-description')).toContainText('mainland China')
})

test('mobile all-tools filters and pinned navigation stay usable without overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tools?tag=video&tag=parse')
  await page.getByRole('button', { name: '固定 社交平台解析 到侧边栏' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/tags-mobile.png', fullPage: true })
  await page.getByRole('button', { name: '打开导航' }).click()
  await page.locator('.pinned-tools a').click()
  await expect(page.locator('.sidebar')).not.toHaveClass(/mobile-open/)
  await expect(page.locator('.ui-panel-description')).toContainText('可选择接口提供的画质')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
