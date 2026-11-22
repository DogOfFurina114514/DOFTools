import { expect, test } from '@playwright/test'

const api = 'https://openapi.dwo.cc/api/svparse**'
const highUrl = 'https://cdn.example/high.mp4?signature=' + 'x'.repeat(700)
const sample = {
  code: 200,
  data: {
    type: 'video',
    title: '视频标题 <script>literal text</script>',
    url: 'https://cdn.example/default.mp4',
    video_backup: [
      {
        url: 'https://cdn.example/default.mp4',
        label: '720P',
        width: 1280,
        height: 720,
        size: 1048576,
        format: 'mp4',
        codec: 'h264',
      },
      {
        url: highUrl,
        label: '1080P',
        width: 1920,
        height: 1080,
        size: 2097152,
        format: 'mp4',
        codec: 'h265',
      },
    ],
    audio_backup: [
      { url: 'https://cdn.example/audio-64.m4s', label: '64kbps' },
      { url: 'https://cdn.example/audio-132.m4s', label: '132kbps' },
    ],
    images: ['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg'],
  },
}
const share = 'https://www.xiaohongshu.com/explore/abc123?xsec_token=A%2BB%3D&xsec_source=pc_share'

test('quality, audio and image selection opens and copies the chosen URL without downloading other media', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const requests: string[] = [],
    mediaRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().startsWith('https://cdn.example/')) mediaRequests.push(request.url())
  })
  await page.route(api, async (route) => {
    expect(route.request().method()).toBe('GET')
    requests.push(new URL(route.request().url()).searchParams.get('url')!)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(sample) })
  })
  await page.goto('/tool/social-link')
  await page.getByRole('textbox', { name: '视频或帖子链接 / 分享文案' }).fill(share)
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.locator('.ui-result')).toContainText('已解析 1 / 1')
  expect(requests).toEqual([share])
  await expect(page.locator('.share-preview')).toContainText(
    '视频标题 <script>literal text</script>',
  )
  await expect(page.locator('.share-preview script')).toHaveCount(0)
  const video = page.locator('.social-media-picker[data-kind=video]')
  await expect(video.locator('.social-media-open')).toHaveAttribute(
    'href',
    'https://cdn.example/default.mp4',
  )
  await video.getByRole('combobox', { name: '画质' }).click()
  await expect(page.getByRole('option')).toHaveCount(2)
  await page.getByRole('option', { name: /1080P/ }).click()
  await expect(video.getByRole('combobox')).toContainText('1920 × 1080')
  await expect(video.getByRole('combobox')).toContainText('2.0 MB')
  await expect(video.locator('.social-media-open')).toHaveAttribute('href', highUrl)
  await video.getByRole('button', { name: '复制所选链接' }).click()
  await expect(video.getByRole('status')).toHaveText('链接已复制。')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(highUrl)
  const audio = page.locator('.social-media-picker[data-kind=audio]')
  await audio.getByRole('combobox', { name: '音轨' }).click()
  await page.getByRole('option', { name: '132kbps' }).click()
  await expect(audio.locator('.social-media-open')).toHaveAttribute(
    'href',
    'https://cdn.example/audio-132.m4s',
  )
  const image = page.locator('.social-media-picker[data-kind=image]')
  await image.getByRole('combobox', { name: '图片' }).press('ArrowDown')
  await page.getByRole('option', { name: '图片 2' }).click()
  await expect(image.locator('.social-media-open')).toHaveAttribute(
    'href',
    'https://cdn.example/2.jpg',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(
    () => document.querySelector('.sidebar')!.getBoundingClientRect().right <= 0,
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await video.getByRole('combobox', { name: '画质' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('option', { name: /720P/ }).click()
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(video.getByRole('combobox', { name: 'Video quality' })).toBeVisible()
  await expect(page.locator('.ui-result')).toContainText('Resolved 1 / 1')
  await expect(video.locator('.social-media-open')).toContainText('Open / save video')
  expect(mediaRequests).toEqual([])
})

test('partial failures preserve successful media, while an all-failed batch reports an error', async ({
  page,
}) => {
  await page.route(api, async (route) => {
    const url = new URL(route.request().url()).searchParams.get('url')!
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        url.includes('expired') ? { code: '250', msg: '分享已失效', data: '' } : sample,
      ),
    })
  })
  await page.goto('/tool/social-link')
  const input = page.getByRole('textbox', { name: '视频或帖子链接 / 分享文案' })
  await input.fill('https://www.xiaohongshu.com/explore/expired123\n' + share)
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.locator('.ui-result')).toContainText('已解析 1 / 2 个链接，1 个失败')
  await expect(page.locator('.share-preview').first().getByRole('alert')).toContainText(
    '分享已失效',
  )
  await expect(
    page.locator('.share-preview').nth(1).getByRole('combobox', { name: '画质' }),
  ).toBeVisible()
  await input.fill('https://www.xiaohongshu.com/explore/expired123')
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('分享已失效')
  await expect(page.locator('.ui-result')).toHaveCount(0)
})

test('cancelling stops the batch and another run can complete', async ({ page }) => {
  let release!: () => void,
    paused = true
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const calls: string[] = []
  await page.route(api, async (route) => {
    calls.push(route.request().url())
    if (paused) await gate
    await route
      .fulfill({ contentType: 'application/json', body: JSON.stringify(sample) })
      .catch(() => {})
  })
  await page.goto('/tool/social-link')
  const input = page.getByRole('textbox', { name: '视频或帖子链接 / 分享文案' })
  const run = page.getByRole('button', { name: '开始处理', exact: true })
  await input.fill(share + '\nhttps://weixin.qq.com/sph/Abcd')
  await run.click()
  await expect.poll(() => calls.length).toBe(1)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(run).toBeEnabled()
  expect(calls).toHaveLength(1)
  await expect(page.locator('.ui-result')).toHaveCount(0)
  paused = false
  release()
  await input.fill(share)
  await run.click()
  await expect(page.locator('.ui-result')).toContainText('已解析 1 / 1')
  expect(calls).toHaveLength(2)
})

test('unsafe provider media and network failures are rejected; clipboard failure leaves the selected URL visible', async ({
  page,
}) => {
  let responseIndex = 0
  await page.route(api, async (route) => {
    responseIndex++
    if (responseIndex === 2) {
      await route.abort('failed')
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        responseIndex === 1 ? { code: 200, data: { url: 'javascript:alert(1)' } } : sample,
      ),
    })
  })
  await page.goto('/tool/social-link')
  await page.getByRole('textbox', { name: '视频或帖子链接 / 分享文案' }).fill(share)
  const run = page.getByRole('button', { name: '开始处理', exact: true })
  await run.click()
  await expect(page.getByRole('alert')).toContainText('无效媒体')
  await run.click()
  await expect(page.getByRole('alert')).toContainText('网络连接')
  await run.click()
  await expect(page.locator('.ui-result')).toContainText('已解析 1 / 1')
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error('denied')
    }
  })
  const video = page.locator('.social-media-picker[data-kind=video]')
  await video.getByRole('button', { name: '复制所选链接' }).click()
  await expect(video.getByRole('status')).toContainText('请手动复制')
  await expect(video.locator('.social-selected-url')).toHaveText('https://cdn.example/default.mp4')
})
