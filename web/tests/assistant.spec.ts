import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function start(page: Page) {
  await page.addInitScript(() => {
    const Original = window.Worker
    Object.assign(window, { workerStarts: 0, workerStops: 0 })
    class FixtureWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror = null
      terminated = false
      postMessage(data: {
        id: number
        type: string
        messages?: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>
      }) {
        const emit = (message: unknown) => {
          if (!this.terminated) this.onmessage?.({ data: message } as MessageEvent)
        }
        if (data.type === 'load') {
          setTimeout(() => emit({ id: data.id, type: 'loaded' }), 20)
          return
        }
        if (data.type !== 'generate') return
        const messages = data.messages!
        const last = messages.at(-1)!
        const user = [...messages].reverse().find((item) => item.role === 'user')!
        const text =
          typeof user.content === 'string'
            ? user.content
            : (user.content.find((part) => part.type === 'text')?.text ?? '')
        const call = text.includes('推荐')
          ? { id: '1', name: 'show_tools', arguments: { toolIds: ['file-fixture'] } }
          : { id: '1', name: 'run_tool', arguments: { toolId: 'file-fixture', parameters: {} } }
        const markdown =
          '# 测试标题\n\n- **重点**\n- 第二项\n\n| 名称 | 状态 |\n| --- | --- |\n| 文件 | 完成 |\n\n```js\nconsole.log("hello")\n```\n\n> 引用\n\n[页面](/settings)\n\n<script>window.badMarkdown = true</script>\n\n[危险链接](javascript:alert(1))'
        setTimeout(
          () =>
            emit({
              id: data.id,
              type: 'result',
              response: {
                text: text.includes('Markdown') ? markdown : last.role === 'tool' ? '已完成。' : '',
                toolCalls: text.includes('Markdown') || last.role === 'tool' ? [] : [call],
                interrupted: false,
                tokens: 1,
                elapsed: 20,
              },
            }),
          40,
        )
      }
      terminate() {
        this.terminated = true
        ;(window as unknown as { workerStops: number }).workerStops++
      }
    }
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes('ai.worker')) {
          ;(window as unknown as { workerStarts: number }).workerStarts++
          return new FixtureWorker() as unknown as Worker
        }
        super(url, options)
      }
    }
  })
  await page.goto('/ai')
  await page.evaluate(async () => {
    const { registerAssistantFixture } = await import('/tests/fixtures/assistant-tool.ts')
    registerAssistantFixture()
  })
  await page.getByRole('button', { name: '开启助手', exact: true }).click()
  await expect(page.getByText('已就绪', { exact: true })).toBeVisible()
}
async function request(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'AI 对话内容' }).fill(text)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.locator('.ai-tool-card')).toBeVisible()
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible()
}
test('text-only requests show navigable tools without execution and navigation retains the assistant', async ({
  page,
}) => {
  await start(page)
  await request(page, '直接处理我的文件') // Deliberate run_tool response with no upload.
  expect(
    await page.evaluate(() => (window as unknown as { fileExecutions: number }).fileExecutions),
  ).toBe(0)
  await page.locator('.ai-tool-card').click()
  await expect(page).toHaveURL(/\/tool\/file-fixture$/)
  await expect(page.getByRole('link', { name: 'AI 助手', exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => (window as unknown as { workerStops: number }).workerStops),
  ).toBe(0)
  await page.getByRole('link', { name: 'AI 助手', exact: true }).click()
  await expect(page.getByText('已就绪', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭 AI 助手', exact: true }).click()
  expect(
    await page.evaluate(() => (window as unknown as { workerStops: number }).workerStops),
  ).toBe(1)
  await page.locator('[data-ai-nav]').click()
  await expect(page.getByRole('button', { name: '开启助手', exact: true })).toBeVisible()
  await expect(page.locator('.ai-tool-card')).toBeVisible()
})
test('uploaded files execute once, download the real output and survive reload with the conversation', async ({
  page,
}) => {
  await start(page)
  await page.locator('input[type=file]').setInputFiles({
    name: 'input.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Hello Furina'),
  })
  await request(page, '请处理上传的文件')
  expect(
    await page.evaluate(() => (window as unknown as { fileExecutions: number }).fileExecutions),
  ).toBe(1)
  const download = page.getByRole('button', { name: '下载 output.txt', exact: true })
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()])
  expect(await readFile((await file.path())!, 'utf8')).toBe('HELLO FURINA')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.locator('.ai-tool-card')).toContainText('File processing fixture')
  await expect(page.locator('.message-tool')).toContainText('File processed')
  await page.getByRole('button', { name: '中文', exact: true }).click()
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { readConversation } = await import('/src/lib/chat-storage.ts')
        return (await readConversation())?.chat.some((item) => item.outputs?.length)
      }),
    )
    .toBe(true)
  await page.reload()
  await expect(download).toBeVisible()
  await expect(page.locator('.message-user')).toContainText('input.txt')
  await expect(page.getByRole('button', { name: '开启助手', exact: true })).toBeVisible()
  const [restored] = await Promise.all([page.waitForEvent('download'), download.click()])
  expect(await readFile((await restored.path())!, 'utf8')).toBe('HELLO FURINA')
  await page.getByRole('button', { name: '清空对话', exact: true }).click()
  await expect(page.locator('.ai-message')).toHaveCount(0)
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { readConversation } = await import('/src/lib/chat-storage.ts')
        return (await readConversation())?.chat.length
      }),
    )
    .toBe(0)
  await page.reload()
  await expect(page.locator('.ai-message')).toHaveCount(0)
})
test('processing continues across internal navigation and close cancels a running tool', async ({
  page,
}) => {
  await start(page)
  await page.evaluate(() => Object.assign(window, { holdTool: true }))
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'input.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await page.getByRole('textbox', { name: 'AI 对话内容' }).fill('处理文件')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('progressbar', { name: '正在处理' })).toBeVisible()
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '工具箱概览' })
    .click()
  await expect(page.getByRole('link', { name: 'AI 助手', exact: true })).toBeVisible()
  await page.locator('[data-ai-nav]').click()
  await page.getByRole('button', { name: '关闭 AI 助手', exact: true }).click()
  await page.locator('[data-ai-nav]').click()
  await expect(page.getByRole('button', { name: '开启助手', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '下载 output.txt', exact: true })).toHaveCount(0)
  await page.waitForTimeout(900)
  await expect(page.getByRole('button', { name: '下载 output.txt', exact: true })).toHaveCount(0)
})

test('drafts and attachments survive browsing and a running task completes on another page', async ({
  page,
}) => {
  await start(page)
  await page.evaluate(() => Object.assign(window, { holdTool: true }))
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'draft.txt', mimeType: 'text/plain', buffer: Buffer.from('draft') })
  await page.getByRole('textbox', { name: 'AI 对话内容' }).fill('处理文件')
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '工具箱概览' })
    .click()
  await page.getByRole('link', { name: 'AI 助手', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'AI 对话内容' })).toHaveValue('处理文件')
  await expect(page.locator('.image-attachment')).toContainText('draft.txt')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('progressbar', { name: '正在处理' })).toBeVisible()
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '工具箱概览' })
    .click()
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { readConversation } = await import('/src/lib/chat-storage.ts')
        return (await readConversation())?.chat.some((item) => item.outputs?.length)
      }),
    )
    .toBe(true)
  await page.getByRole('link', { name: 'AI 助手', exact: true }).click()
  await expect(page.getByRole('button', { name: '下载 output.txt', exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => (window as unknown as { workerStops: number }).workerStops),
  ).toBe(0)
})

for (const style of ['default', 'material']) {
  test(`${style}: Enter sends, Shift+Enter adds a line, IME does not send, and Markdown renders`, async ({
    page,
  }) => {
    await page.addInitScript(
      (style) => localStorage.setItem('fufu:style', JSON.stringify(style)),
      style,
    )
    await start(page)
    const input = page.getByRole('textbox', { name: 'AI 对话内容' })
    await input.fill('Markdown')
    await input.press('Shift+Enter')
    await input.press('x')
    await expect(input).toHaveValue('Markdown\nx')
    await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })
    await expect(page.locator('.message-user')).toHaveCount(0)
    await input.press('Enter')
    await expect(page.locator('.message-user')).toContainText('Markdown\nx')
    const answer = page.locator('.chat-markdown')
    await expect(answer.getByRole('heading', { name: '测试标题' })).toBeVisible()
    await expect(answer.locator('strong')).toHaveText('重点')
    await expect(answer.getByRole('cell', { name: '完成' })).toBeVisible()
    await expect(answer.locator('pre code')).toHaveText('console.log("hello")\n')
    await expect(answer.locator('blockquote')).toContainText('引用')
    await expect(answer.locator('script')).toHaveCount(0)
    await expect(answer.getByText('危险链接')).not.toHaveAttribute('href', /javascript:/)
    await expect(page.locator('[data-ai-nav]')).toHaveAttribute('aria-current', 'page')
    const selected = await page
      .locator('[data-ai-nav]')
      .evaluate((item) => getComputedStyle(item).backgroundColor)
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: '工具箱概览' })
      .click()
    await expect(page.locator('[data-ai-nav]')).not.toHaveAttribute('aria-current', 'page')
    expect(
      await page
        .locator('[data-ai-nav]')
        .evaluate((item) => getComputedStyle(item).backgroundColor),
    ).not.toBe(selected)
  })
}

test('new theme providers preserve the loaded assistant, draft and uploaded files', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('fufu:openings', 'false'))
  await start(page)
  await page.getByRole('textbox', { name: 'AI 对话内容' }).fill('保留这份草稿')
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'draft.txt', mimeType: 'text/plain', buffer: Buffer.from('draft') })
  for (const theme of ['Fluent Design', '液态玻璃', 'Minecraft']) {
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: '设置与外观' })
      .click()
    await page.getByRole('radio', { name: theme, exact: true }).click()
    await page.locator('[data-ai-nav]').click()
    await expect(page.getByText('已就绪', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'AI 对话内容' })).toHaveValue('保留这份草稿')
    await expect(page.locator('.image-attachment')).toContainText('draft.txt')
    expect(
      await page.evaluate(() => (window as unknown as { workerStops: number }).workerStops),
    ).toBe(0)
  }
})
