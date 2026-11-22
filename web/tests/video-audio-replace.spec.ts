import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { replacementVideo, replacementWav, inspectReplacement } from './helpers/replacement-media'
import { selectChoice } from './helpers/controls'

test.setTimeout(120000)

test.beforeEach(async ({ context }) => {
  // Fixtures and output inspection work against dev and the final Pages build.
  await context.route('**/node_modules/.vite/deps/mediabunny.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      path: fileURLToPath(
        new URL('../node_modules/mediabunny/dist/bundles/mediabunny.mjs', import.meta.url),
      ),
    }),
  )
  await context.route('https://toolbox.owo.lat/runtime/ffmpeg/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    if (name !== 'ffmpeg-core.js' && name !== 'ffmpeg-core.wasm') return route.abort()
    return route.fulfill({
      contentType: name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
      path: fileURLToPath(new URL(`../../docs/runtime/ffmpeg/${name}`, import.meta.url)),
    })
  })
})

for (const format of ['mp4', 'webm']) {
  test(`real ${format} replacement matches either duration, removes original audio and pads silence or the last frame`, async ({
    page,
  }) => {
    await page.goto('/tool/video-audio-replace')
    const video = await replacementVideo(page)
    await page
      .getByLabel('选择视频', { exact: true })
      .setInputFiles({ name: 'original.webm', mimeType: 'video/webm', buffer: Buffer.from(video) })
    await selectChoice(page.getByRole('combobox', { name: '输出格式', exact: true }), format)
    for (const audioDuration of [1, 3]) {
      await page.getByLabel('选择替换音频', { exact: true }).setInputFiles({
        name: 'replacement.wav',
        mimeType: 'audio/wav',
        buffer: Buffer.from(replacementWav(audioDuration)),
      })
      for (const length of ['video', 'audio']) {
        await selectChoice(page.getByRole('combobox', { name: '输出长度', exact: true }), length)
        await page.getByRole('button', { name: '开始处理', exact: true }).click()
        await expect(page.locator('.ui-result')).toContainText('视频音轨已替换', { timeout: 60000 })
        const duration = length === 'video' ? 2 : audioDuration
        await expect(page.locator('.ui-result')).toContainText(`输出 ${duration.toFixed(2)} 秒`)
        const downloaded = page.waitForEvent('download')
        await page.getByRole('button', { name: `下载 original.${format}`, exact: true }).click()
        const download = await downloaded
        expect(download.suggestedFilename()).toBe(`original.${format}`)
        const bytes = await readFile((await download.path())!)
        const info = await inspectReplacement(page, Array.from(bytes), duration)
        expect(info.videoTracks).toBe(1)
        expect(info.audioTracks).toBe(1)
        expect(Math.abs(info.duration - duration)).toBeLessThan(0.12)
        expect(Math.abs(info.videoDuration - duration)).toBeLessThan(0.12)
        expect(Math.abs(info.audioDuration - duration)).toBeLessThan(0.06)
        expect(info.start.rms).toBeGreaterThan(0.05)
        expect(info.start.replacement).toBeGreaterThan(info.start.original * 5)
        if (audioDuration < duration) {
          expect(info.tail.rms).toBeLessThan(0.003)
          await expect(page.locator('.ui-result')).toContainText('补静音')
        }
        if (duration < 1.1) expect(info.color[2]).toBeGreaterThan(info.color[0] * 2)
        else expect(info.color[0]).toBeGreaterThan(info.color[2] * 2)
        if (duration > 2.1) await expect(page.locator('.ui-result')).toContainText('延长最后一帧')
      }
    }
    await page.getByRole('button', { name: 'English', exact: true }).click()
    await expect(page.getByRole('combobox', { name: 'Output duration' })).toContainText(
      'Match audio duration',
    )
    await expect(page.locator('.ui-result')).toContainText('Replaced the video audio track')
  })
}

test('replacement rejects missing tracks and invalid files, and a cancelled runtime load produces no result', async ({
  page,
}) => {
  await page.goto('/tool/video-audio-replace')
  const video = await replacementVideo(page, false)
  const wav = { name: 'tone.wav', mimeType: 'audio/wav', buffer: Buffer.from(replacementWav(1)) }
  const run = page.getByRole('button', { name: '开始处理', exact: true })
  await run.click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByLabel('选择视频', { exact: true }).setInputFiles(wav)
  await page.getByLabel('选择替换音频', { exact: true }).setInputFiles(wav)
  await run.click()
  await expect(page.getByRole('alert')).toContainText('没有视频轨道')
  await page
    .getByLabel('选择视频', { exact: true })
    .setInputFiles({ name: 'silent.webm', mimeType: 'video/webm', buffer: Buffer.from(video) })
  await page
    .getByLabel('选择替换音频', { exact: true })
    .setInputFiles({ name: 'silent.webm', mimeType: 'video/webm', buffer: Buffer.from(video) })
  await run.click()
  await expect(page.getByRole('alert')).toContainText('没有音频轨道')
  await page
    .getByLabel('选择替换音频', { exact: true })
    .setInputFiles({ name: 'invalid.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid') })
  await run.click()
  await expect(page.getByRole('alert')).toContainText('有效、未加密')
  await page.getByLabel('选择替换音频', { exact: true }).setInputFiles(wav)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const requested = page.waitForRequest('**/runtime/ffmpeg/ffmpeg-core.wasm')
  await page.route('**/runtime/ffmpeg/ffmpeg-core.wasm', async (route) => {
    await gate
    await route.fallback().catch(() => {})
  })
  await run.click()
  await requested
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(run).toBeEnabled()
  await expect(page.locator('.ui-result')).toHaveCount(0)
  release()
})
