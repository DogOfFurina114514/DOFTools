import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('real Qwen weights run text, vision and registered function calls locally', async ({
  page,
}) => {
  test.skip(
    process.env.FUFU_TEST_MODEL !== '1',
    'Real WebGPU inference is opt-in: FUFU_TEST_MODEL=1',
  )
  test.setTimeout(600_000)
  page.setDefaultTimeout(30_000)
  const external: string[] = []
  page.on('request', (request) => {
    if (!/^(http:\/\/127\.0\.0\.1:5173|blob:|data:)/.test(request.url()))
      external.push(request.url())
  })
  await page.goto('/#/ai')
  await page.evaluate(() => {
    const Original = window.Worker
    Object.assign(window, { modelOutput: [] })
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'token' || data.type === 'result' || data.type === 'error') {
            const state = window as unknown as { modelOutput: unknown[] }
            state.modelOutput.push(data)
            if (state.modelOutput.length > 500) state.modelOutput.shift()
          }
        })
      }
    }
  })
  await expect(page.getByRole('button', { name: '开启助手' })).toBeVisible()
  await page.getByRole('button', { name: '开启助手' }).click()
  await expect(page.getByText('已就绪', { exact: true })).toBeVisible({ timeout: 120_000 })
  console.log('Real model loaded')
  const input = page.getByRole('textbox', { name: 'AI 对话内容' })
  const send = page.getByRole('button', { name: '发送', exact: true })
  const ask = async (text: string) => {
    console.log('Prompt:', text)
    await input.fill(text)
    await send.click()
    await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible()
    try {
      await expect(send).toBeVisible({ timeout: 300_000 })
    } catch (error) {
      console.log(
        JSON.stringify(
          await page.evaluate(() => (window as unknown as { modelOutput: unknown[] }).modelOutput),
        ),
      )
      throw error
    }
    await expect(page.locator('.error-message')).toHaveCount(0)
    const answer = await page.locator('.message-assistant').last().innerText()
    console.log(answer)
    return answer
  }
  if (process.env.FUFU_MODEL_TOOLS_ONLY !== '1') {
    expect(await ask('1加1等于几？请简短回答。')).toContain('2')
    await page.getByRole('button', { name: '清空对话' }).click()
    const image = await page.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const context = c.getContext('2d')!
      context.fillStyle = '#ff0000'
      context.fillRect(0, 0, 256, 256)
      context.fillStyle = '#ffffff'
      context.beginPath()
      context.arc(128, 128, 65, 0, Math.PI * 2)
      context.fill()
      return c.toDataURL().split(',')[1]
    })
    await page.locator('input[type=file]').setInputFiles({
      name: 'vision.png',
      mimeType: 'image/png',
      buffer: Buffer.from(image, 'base64'),
    })
    const vision = await ask('请用一句话描述这张图片的中心形状。')
    expect(vision).toMatch(/圆|circle/i)
  }
  if (await page.getByRole('button', { name: '清空对话' }).isEnabled())
    await page.getByRole('button', { name: '清空对话' }).click()
  if (process.env.FUFU_MODEL_FILES_ONLY !== '1') {
    await page.evaluate(async () => {
      const { registerModelFixture } = await import('/tests/fixtures/model-tool.ts')
      registerModelFixture()
    })
    await ask('请帮我找到测试加法工具，展示工具卡片，我要前往使用。')
    await expect(page.locator('.ai-tool-card')).toContainText('测试加法')
    await expect(page.locator('.message-tool')).not.toContainText('42')
    await page.getByRole('button', { name: '清空对话' }).click()
  }
  await page.evaluate(async () => {
    const { registerAssistantFixture } = await import('/tests/fixtures/assistant-tool.ts')
    registerAssistantFixture()
  })
  await page.locator('input[type=file]').setInputFiles({
    name: 'input.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Hello Furina'),
  })
  await ask('请使用文件处理测试工具，把我上传的文本转成大写，直接处理并提供输出文件。')
  const download = page.getByRole('button', { name: '下载 output.txt', exact: true })
  await expect(download).toBeVisible()
  const [output] = await Promise.all([page.waitForEvent('download'), download.click()])
  expect(await readFile((await output.path())!, 'utf8')).toBe('HELLO FURINA')
  await input.fill('请详细介绍前端开发的历史。')
  await send.click()
  await page.getByRole('button', { name: '停止生成' }).click()
  await expect(send).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('已停止生成', { exact: true })).toBeVisible()
  const unload = page.getByRole('button', { name: '关闭 AI 助手' })
  if (await unload.isVisible()) await unload.click()
  await page.goto('/#/ai')
  await expect(page.getByRole('button', { name: '开启助手' })).toBeVisible()
  expect(external).toEqual([])
})
