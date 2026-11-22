import { test, expect, type Page } from '@playwright/test'
import { gifFixture } from './helpers/gif-fixture'
import { selectChoice } from './helpers/controls'

test.setTimeout(120000)

async function execute(
  page: Page,
  id: string,
  name: string,
  bytes: number[],
  values: Record<string, string | number | boolean> = {},
) {
  return page.evaluate(
    async ({ id, name, bytes, values }) => {
      const entry = '/src/tools/index.ts'
      const { toolRegistry } = await import(entry)
      const progress: number[] = []
      const result = await toolRegistry.run(
        id,
        {
          ...toolRegistry.get(id).initialValues,
          ...values,
          files: [new File([new Uint8Array(bytes)], name)],
        },
        {
          locale: 'en',
          signal: new AbortController().signal,
          onProgress: (value: number) => progress.push(value),
        },
      )
      return {
        name: result.files[0].name,
        mime: result.files[0].blob.type,
        bytes: Array.from(new Uint8Array(await result.files[0].blob.arrayBuffer())) as number[],
        progress,
        details: result.details,
      }
    },
    { id, name, bytes, values },
  )
}

async function videoInfo(page: Page, bytes: number[], times: number[]) {
  return page.evaluate(
    async ({ bytes, times }) => {
      const entry = '/node_modules/.vite/deps/mediabunny.js'
      const { Input, BlobSource, ALL_FORMATS, VideoSampleSink } = await import(entry)
      const input = new Input({
        source: new BlobSource(new Blob([new Uint8Array(bytes)])),
        formats: ALL_FORMATS,
      })
      try {
        const track = await input.getPrimaryVideoTrack()
        const sink = new VideoSampleSink(track)
        const canvas = document.createElement('canvas')
        canvas.width = await track.getDisplayWidth()
        canvas.height = await track.getDisplayHeight()
        const ctx = canvas.getContext('2d')!
        const colors = []
        for (const time of times) {
          const sample = await sink.getSample(time)
          sample.draw(ctx, 0, 0)
          sample.close()
          colors.push({
            center: Array.from(
              ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1)
                .data,
            ),
            border: Array.from(ctx.getImageData(2, 2, 1, 1).data),
          })
        }
        return {
          duration: await input.computeDuration(),
          audio: !!(await input.getPrimaryAudioTrack()),
          width: canvas.width,
          height: canvas.height,
          colors,
        }
      } finally {
        input.dispose()
      }
    },
    { bytes, times },
  )
}

async function decodeGif(page: Page, bytes: number[]) {
  return page.evaluate(async (bytes) => {
    const decoder = new (window as any).ImageDecoder({
      data: new Uint8Array(bytes),
      type: 'image/gif',
      preferAnimation: true,
    })
    try {
      await decoder.tracks.ready
      const colors: number[][] = [],
        delays: number[] = []
      let width = 0,
        height = 0
      for (let frameIndex = 0; frameIndex < decoder.tracks.selectedTrack.frameCount; frameIndex++) {
        const { image } = await decoder.decode({ frameIndex })
        const canvas = document.createElement('canvas')
        canvas.width = width = image.displayWidth
        canvas.height = height = image.displayHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(image, 0, 0)
        colors.push(
          Array.from(ctx.getImageData(Math.floor(width / 2), Math.floor(height / 2), 1, 1).data),
        )
        delays.push(image.duration / 1_000_000)
        image.close()
      }
      return { width, height, colors, delays, loops: decoder.tracks.selectedTrack.repetitionCount }
    } finally {
      decoder.close()
    }
  }, bytes)
}

for (const format of ['mp4', 'webm'])
  for (const background of ['white', 'black']) {
    test(`animated GIF to ${format} preserves unequal delays, last frame and ${background} transparency`, async ({
      page,
    }) => {
      await page.goto('/')
      const result = await execute(page, 'gif-video', 'animation.gif', Array.from(gifFixture()), {
        format,
        background,
      })
      expect(result.name).toBe(`animation.${format}`)
      expect(result.mime).toBe(`video/${format}`)
      expect(result.progress.at(-1)).toBe(1)
      const info = await videoInfo(page, result.bytes, [0.05, 0.16, 0.18, 0.59, 0.61, 0.85])
      expect(info.audio).toBe(false)
      expect(info.duration).toBeCloseTo(0.89, 2)
      expect([info.width, info.height]).toEqual([96, 56])
      for (const [index, channel] of [0, 0, 2, 2, 1, 1].entries()) {
        expect(info.colors[index].center[channel]).toBeGreaterThan(180)
        expect(info.colors[index].center[(channel + 1) % 3]).toBeLessThan(60)
        const expected = background === 'white' ? 255 : 0
        for (const color of info.colors[index].border.slice(0, 3))
          expect(Math.abs(color - expected)).toBeLessThan(15)
      }
    })
  }

test('GIF to video resizes without upscaling and handles a still GIF with default delay', async ({
  page,
}) => {
  await page.goto('/')
  const resized = await execute(page, 'gif-video', 'small.gif', Array.from(gifFixture()), {
    maxEdge: 64,
  })
  const info = await videoInfo(page, resized.bytes, [0.05])
  expect([info.width, info.height]).toEqual([64, 38])
  const still = await execute(page, 'gif-video', 'still.gif', Array.from(gifFixture([0])), {
    format: 'webm',
  })
  expect((await videoInfo(page, still.bytes, [0.05])).duration).toBeCloseTo(0.1, 2)
})

test('video to GIF creates multiple changing frames, trims, limits fps and controls looping', async ({
  page,
}) => {
  await page.goto('/')
  const source = await execute(page, 'gif-video', 'roundtrip.gif', Array.from(gifFixture()))
  const result = await execute(page, 'video-gif', source.name, source.bytes, {
    duration: 5,
    fps: 10,
    maxEdge: 64,
  })
  const gif = await decodeGif(page, result.bytes)
  expect([gif.width, gif.height]).toEqual([64, 37])
  expect(gif.colors.length).toBeGreaterThanOrEqual(8)
  expect(gif.colors.length).toBeLessThanOrEqual(10)
  expect(gif.colors[0][0]).toBeGreaterThan(180)
  expect(gif.colors[4][2]).toBeGreaterThan(180)
  expect(gif.colors.at(-1)![1]).toBeGreaterThan(180)
  expect(gif.delays.reduce((sum, value) => sum + value, 0)).toBeCloseTo(0.9, 1)
  expect(gif.loops).toBe(Infinity)
  const clip = await execute(page, 'video-gif', source.name, source.bytes, {
    start: 0.2,
    duration: 0.3,
    fps: 10,
    loop: false,
  })
  const trimmed = await decodeGif(page, clip.bytes)
  expect(trimmed.colors).toHaveLength(3)
  expect(trimmed.delays.reduce((sum, value) => sum + value, 0)).toBeCloseTo(0.3, 2)
  expect(trimmed.colors.every((color) => color[2] > 180)).toBe(true)
  expect(trimmed.loops).toBe(0)
  const short = await execute(page, 'video-gif', source.name, source.bytes, {
    start: 0.2,
    duration: 0.1,
    fps: 1,
    loop: false,
  })
  const single = await decodeGif(page, short.bytes)
  expect(single.colors).toHaveLength(1)
  expect(single.delays[0]).toBeCloseTo(0.1, 2)
})

test('WebM with audio and a rotated MP4 convert to GIF with the displayed aspect ratio', async ({
  page,
}) => {
  await page.goto('/')
  for (const format of ['webm', 'mp4']) {
    const bytes = await page.evaluate(async (format) => {
      const entry = '/node_modules/.vite/deps/mediabunny.js'
      const {
        Output,
        WebMOutputFormat,
        Mp4OutputFormat,
        BufferTarget,
        CanvasSource,
        AudioBufferSource,
      } = await import(entry)
      const target = new BufferTarget()
      const output = new Output({
        target,
        format: format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat(),
      })
      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 90
      const video = new CanvasSource(canvas, {
        codec: format === 'webm' ? 'vp9' : 'avc',
        bitrate: 300000,
      })
      output.addVideoTrack(video, { frameRate: 10, rotation: format === 'mp4' ? 90 : 0 })
      const audio = new AudioBufferSource({
        codec: format === 'webm' ? 'opus' : 'aac',
        bitrate: 96000,
      })
      output.addAudioTrack(audio)
      await output.start()
      const audioDone = audio.add(
        new AudioBuffer({ length: 48000, sampleRate: 48000, numberOfChannels: 1 }),
      )
      for (let frame = 0; frame < 10; frame++) {
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = frame < 5 ? '#ee2211' : '#1122ee'
        ctx.fillRect(0, 0, 160, 90)
        await video.add(frame / 10, 0.1)
      }
      await audioDone
      await output.finalize()
      return Array.from(new Uint8Array(target.buffer)) as number[]
    }, format)
    const result = await execute(page, 'video-gif', `with-audio.${format}`, bytes, {
      duration: 1,
      maxEdge: 64,
    })
    const gif = await decodeGif(page, result.bytes)
    expect([gif.width, gif.height]).toEqual(format === 'mp4' ? [36, 64] : [64, 36])
    expect(gif.colors[0][0]).toBeGreaterThan(180)
    expect(gif.colors.at(-1)![2]).toBeGreaterThan(180)
  }
})

test('invalid files, duration limits and out-of-range starts fail; cancellation stops a running Worker', async ({
  page,
}) => {
  await page.goto('/')
  const source = await execute(page, 'gif-video', 'sample.gif', Array.from(gifFixture()))
  const result = await page.evaluate(
    async ({ video, gif, tooLong }) => {
      const entry = '/src/tools/index.ts'
      const { toolRegistry } = await import(entry)
      const failures = []
      for (const [id, bytes, overrides, cancel] of [
        ['gif-video', [1, 2, 3], {}, false],
        ['gif-video', tooLong, {}, false],
        ['video-gif', [1, 2, 3], {}, false],
        ['video-gif', video, { start: 100 }, false],
        ['gif-video', gif, {}, true],
        ['video-gif', video, {}, true],
      ] as const) {
        const controller = new AbortController()
        try {
          await toolRegistry.run(
            id,
            {
              ...toolRegistry.get(id).initialValues,
              ...overrides,
              files: [new File([new Uint8Array(bytes)], 'input')],
            },
            {
              locale: 'en',
              signal: controller.signal,
              onProgress: () => {},
              onStatus: (status: { en: string }) => {
                if (cancel && /Encoding|Analyzing/.test(status.en)) controller.abort()
              },
            },
          )
          failures.push({ name: 'unexpected success', message: '' })
        } catch (error: any) {
          failures.push({ name: error.name, message: error.messages?.en ?? error.message })
        }
      }
      return failures
    },
    {
      video: source.bytes,
      gif: Array.from(gifFixture()),
      tooLong: Array.from(gifFixture([6001], 1, 1)),
    },
  )
  expect(result[0].message).toContain('invalid')
  expect(result[1].message).toContain('60 seconds')
  expect(result[2].message).toContain('Cannot read')
  expect(result[3].message).toContain('start time')
  expect(result.slice(4).map((error) => error.name)).toEqual(['AbortError', 'AbortError'])
  // A cancelled conversion must not leave a broken shared core for subsequent jobs.
  const again = await execute(page, 'gif-video', 'again.gif', Array.from(gifFixture([10])))
  expect(again.bytes.length).toBeGreaterThan(100)
})

test('both tools are discoverable in Chinese and English and the workspace downloads real output', async ({
  page,
}) => {
  await page.goto('/category/video')
  await expect(page.getByRole('link', { name: /视频转 GIF/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /GIF 转视频/ })).toBeVisible()
  for (const [query, title] of [
    ['视频转GIF', '视频转 GIF'],
    ['GIF转视频', 'GIF 转视频'],
    ['video to gif', '视频转 GIF'],
    ['gif to video', 'GIF 转视频'],
  ]) {
    await page.keyboard.press('Control+k')
    await page.getByRole('searchbox', { name: '搜索关键词' }).fill(query)
    await expect(page.locator('.tool-list-card').first()).toContainText(title)
    await page.keyboard.press('Escape')
  }
  await page.goto('/tool/gif-video')
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'ui.gif', mimeType: 'image/gif', buffer: Buffer.from(gifFixture()) })
  await selectChoice(page.getByRole('combobox', { name: '输出格式', exact: true }), 'webm')
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.locator('.ui-result')).toContainText('GIF 已转换为 WEBM', { timeout: 60000 })
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 ui.webm', exact: true }).click()
  expect((await downloadEvent).suggestedFilename()).toBe('ui.webm')
})
