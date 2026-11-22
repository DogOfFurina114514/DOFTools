import { test, expect, type Page } from '@playwright/test'
import { selectChoice } from './helpers/controls'

test.setTimeout(120000)

async function imageSample(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 240
    const ctx = canvas.getContext('2d')!
    const pixels = ctx.createImageData(canvas.width, canvas.height)
    let seed = 13
    for (let index = 0; index < pixels.data.length; index += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      pixels.data[index] = seed & 255
      pixels.data[index + 1] = (seed >>> 8) & 255
      pixels.data[index + 2] = (seed >>> 16) & 255
      pixels.data[index + 3] = index < 320 * 4 ? 0 : 255
    }
    ctx.putImageData(pixels, 0, 0)
    return Array.from(
      new Uint8Array(
        await (
          await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)))
        ).arrayBuffer(),
      ),
    )
  })
}

async function execute(
  page: Page,
  id: string,
  bytes: number[],
  values: Record<string, string | number>,
  count = 1,
) {
  return page.evaluate(
    async ({ id, bytes, values, count }) => {
      const entry = '/src/tools/index.ts'
      const { toolRegistry } = await import(entry)
      const progress: number[] = []
      const result = await toolRegistry.run(
        id,
        {
          ...toolRegistry.get(id)!.initialValues,
          ...values,
          files: Array.from(
            { length: count },
            () =>
              new File(
                [new Uint8Array(bytes)],
                id === 'image-compress' ? 'same.photo.png' : 'sample.webm',
              ),
          ),
        },
        {
          locale: 'en',
          signal: new AbortController().signal,
          onProgress: (value: number) => progress.push(value),
        },
      )
      return {
        summary: result.summary,
        details: result.details,
        progress,
        files: await Promise.all(
          result.files.map(async (file: { name: string; blob: Blob }) => ({
            name: file.name,
            type: file.blob.type,
            size: file.blob.size,
            bytes: Array.from(new Uint8Array(await file.blob.arrayBuffer())),
          })),
        ),
      }
    },
    { id, bytes, values, count },
  )
}

test('image manual parameters resize without upscaling and JPEG fills transparent pixels white', async ({
  page,
}) => {
  await page.goto('/')
  const bytes = await imageSample(page)
  const result = await execute(page, 'image-compress', bytes, {
    format: 'jpg',
    quality: 65,
    maxEdge: 160,
  })
  expect(result.files[0].name).toBe('same.photo-compressed.jpg')
  expect(result.files[0].size).toBeLessThan(bytes.length)
  expect(result.details[0].en).toContain('quality 65')
  const image = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
    )
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const pixel = Array.from(ctx.getImageData(0, 0, 1, 1).data)
    const size = [bitmap.width, bitmap.height]
    bitmap.close()
    return { pixel, size }
  }, result.files[0].bytes)
  expect(image.size).toEqual([160, 120])
  expect(image.pixel[3]).toBe(255)
  expect(image.pixel[0]).toBeGreaterThan(150)
  const original = await execute(page, 'image-compress', bytes, { format: 'webp', maxEdge: 9999 })
  expect(original.details[0].en).toContain('320 × 240')
})

for (const format of ['jpg', 'webp', 'png']) {
  test(`image ${format} target mode meets each file limit with unique batch names`, async ({
    page,
  }) => {
    await page.goto('/')
    const bytes = await imageSample(page)
    const result = await execute(
      page,
      'image-compress',
      bytes,
      {
        format,
        compressionMode: 'target',
        targetSize: 4,
        sizeUnit: 'kib',
        quality: '',
      },
      2,
    )
    expect(new Set(result.files.map((file: { name: string }) => file.name)).size).toBe(2)
    for (const file of result.files) {
      expect(file.size).toBeLessThanOrEqual(4096)
      expect(file.size).toBeGreaterThan(0)
      expect(file.type).toBe(format === 'jpg' ? 'image/jpeg' : `image/${format}`)
      const dimensions = await page.evaluate(async (bytes) => {
        const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]))
        const size = [image.width, image.height]
        image.close()
        return size
      }, file.bytes)
      expect(dimensions[0]).toBeLessThanOrEqual(320)
      expect(dimensions[1]).toBeLessThanOrEqual(240)
    }
    expect(result.progress.at(-1)).toBe(1)
  })
}

test('image unattainable targets fail clearly and cancellation stops without returning files', async ({
  page,
}) => {
  await page.goto('/')
  const bytes = await imageSample(page)
  const errors = await page.evaluate(async (bytes) => {
    const entry = '/src/tools/index.ts'
    const { toolRegistry } = await import(entry)
    const values = {
      ...toolRegistry.get('image-compress').initialValues,
      files: [new File([new Uint8Array(bytes)], 'noise.png')],
      compressionMode: 'target',
      targetSize: 0.001,
      sizeUnit: 'kib',
    }
    const failure = async (cancel: boolean) => {
      const controller = new AbortController()
      try {
        await toolRegistry.run('image-compress', values, {
          locale: 'en',
          signal: controller.signal,
          onProgress: () => {},
          onStatus: (value: { en: string }) => {
            if (cancel && value.en.startsWith('Calculating')) controller.abort()
          },
        })
        return 'unexpected success'
      } catch (error) {
        return { name: error.name, message: error.messages?.en ?? error.message }
      }
    }
    return [await failure(false), await failure(true)]
  }, bytes)
  expect(errors[0].message).toContain('cannot fit')
  expect(errors[1].name).toBe('AbortError')
})

async function videoSample(page: Page, withAudio = true) {
  return page.evaluate(async (withAudio) => {
    const entry = '/node_modules/.vite/deps/mediabunny.js'
    const { Output, WebMOutputFormat, BufferTarget, CanvasSource, AudioBufferSource } =
      await import(entry)
    const target = new BufferTarget()
    const output = new Output({ target, format: new WebMOutputFormat() })
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const video = new CanvasSource(canvas, { codec: 'vp9', bitrate: 1500000 })
    output.addVideoTrack(video, { frameRate: 12 })
    const audio = withAudio ? new AudioBufferSource({ codec: 'opus', bitrate: 128000 }) : null
    if (audio) output.addAudioTrack(audio)
    await output.start()
    let audioDone: Promise<void> | undefined
    if (audio) {
      const buffer = new AudioBuffer({ length: 48000 * 3, sampleRate: 48000, numberOfChannels: 1 })
      const samples = buffer.getChannelData(0)
      for (let index = 0; index < samples.length; index++)
        samples[index] = Math.sin((index / 48000) * Math.PI * 880) * 0.2
      audioDone = audio.add(buffer)
    }
    const ctx = canvas.getContext('2d')!
    const pixels = ctx.createImageData(320, 180)
    let seed = 77
    for (let frame = 0; frame < 36; frame++) {
      for (let i = 0; i < pixels.data.length; i += 4) {
        seed = (seed * 1664525 + 1013904223) >>> 0
        pixels.data[i] = seed & 255
        pixels.data[i + 1] = (seed >>> 8) & 255
        pixels.data[i + 2] = (seed >>> 16) & 255
        pixels.data[i + 3] = 255
      }
      ctx.putImageData(pixels, 0, 0)
      await video.add(frame / 12, 1 / 12)
    }
    await audioDone
    await output.finalize()
    return Array.from(new Uint8Array(target.buffer)) as number[]
  }, withAudio)
}

async function videoInfo(page: Page, bytes: number[]) {
  return page.evaluate(async (bytes) => {
    const entry = '/node_modules/.vite/deps/mediabunny.js'
    const { Input, BlobSource, ALL_FORMATS, VideoSampleSink, AudioSampleSink } = await import(entry)
    const input = new Input({
      source: new BlobSource(new Blob([new Uint8Array(bytes)])),
      formats: ALL_FORMATS,
    })
    try {
      const video = await input.getPrimaryVideoTrack(),
        audio = await input.getPrimaryAudioTrack()
      const frame = await new VideoSampleSink(video).getSample(0)
      const sample = audio ? await new AudioSampleSink(audio).getSample(0) : null
      const info = {
        duration: await input.computeDuration(),
        width: await video.getDisplayWidth(),
        height: await video.getDisplayHeight(),
        rate: (await video.computePacketStats()).averagePacketRate,
        video: !!frame,
        audio: !!audio,
        audioDecoded: !!sample,
      }
      frame?.close()
      sample?.close()
      return info
    } finally {
      input.dispose()
    }
  }, bytes)
}

for (const format of ['mp4', 'webm']) {
  test(`video ${format} manual and target modes produce smaller decodable videos and retain audio`, async ({
    page,
  }) => {
    await page.goto('/')
    const bytes = await videoSample(page)
    for (const compressionMode of ['manual', 'target']) {
      const result = await execute(page, 'video-compress', bytes, {
        format,
        compressionMode,
        videoBitrate: 180,
        audioBitrate: format === 'mp4' ? 96 : 32,
        targetSize: format === 'mp4' ? 80 : 40,
        sizeUnit: 'kib',
        frameRate: 6,
        resolution: 'original',
      })
      expect(result.files[0].size).toBeLessThan(bytes.length)
      if (compressionMode === 'target')
        expect(result.files[0].size).toBeLessThanOrEqual((format === 'mp4' ? 80 : 40) * 1024)
      const info = await videoInfo(page, result.files[0].bytes)
      expect(info.video).toBe(true)
      expect(info.audio).toBe(true)
      expect(info.audioDecoded).toBe(true)
      expect(info.duration).toBeGreaterThan(2.8)
      expect(info.duration).toBeLessThan(3.3)
      expect(info.width).toBeLessThanOrEqual(320)
      expect(info.height).toBeLessThanOrEqual(180)
      expect(info.rate).toBeLessThanOrEqual(6.1)
      expect(result.progress.at(-1)).toBe(1)
      expect(
        result.progress.every(
          (value: number, i: number) =>
            value >= 0 && value <= 1 && (!i || value >= result.progress[i - 1]),
        ),
      ).toBe(true)
    }
    if (format === 'mp4') {
      const supportsLowAac = await page.evaluate(async () => {
        const entry = '/node_modules/.vite/deps/mediabunny.js'
        const { canEncodeAudio } = await import(entry)
        return canEncodeAudio('aac', { numberOfChannels: 1, sampleRate: 48000, bitrate: 32000 })
      })
      if (!supportsLowAac)
        await expect(
          execute(page, 'video-compress', bytes, { format: 'mp4', audioBitrate: 32 }),
        ).rejects.toThrow('不支持 32 kbps')
    }
  })
}

test('video audio removal, silent input and impossible targets behave correctly', async ({
  page,
}) => {
  await page.goto('/')
  const bytes = await videoSample(page)
  for (const values of [
    { audioBitrate: 0 },
    { compressionMode: 'target', targetSize: 40, sizeUnit: 'kib', targetAudio: 'remove' },
  ]) {
    const result = await execute(page, 'video-compress', bytes, { format: 'webm', ...values })
    expect((await videoInfo(page, result.files[0].bytes)).audio).toBe(false)
  }
  const silent = await execute(page, 'video-compress', await videoSample(page, false), {
    format: 'webm',
    compressionMode: 'target',
    targetSize: 40,
    sizeUnit: 'kib',
  })
  expect((await videoInfo(page, silent.files[0].bytes)).audio).toBe(false)
  await expect(
    execute(page, 'video-compress', bytes, {
      compressionMode: 'target',
      targetSize: 1,
      sizeUnit: 'kib',
    }),
  ).rejects.toThrow('目标大小过小')
})

test('video cancellation terminates the worker during actual compression', async ({ page }) => {
  await page.goto('/')
  const bytes = await videoSample(page)
  const result = await page.evaluate(async (bytes) => {
    const entry = '/src/tools/index.ts'
    const { toolRegistry } = await import(entry)
    const controller = new AbortController()
    try {
      await toolRegistry.run(
        'video-compress',
        {
          ...toolRegistry.get('video-compress').initialValues,
          files: [new File([new Uint8Array(bytes)], 'noise.webm')],
        },
        {
          locale: 'en',
          signal: controller.signal,
          onProgress: () => {},
          onStatus: (value: { en: string }) => {
            if (value.en.startsWith('Compressing')) controller.abort()
          },
        },
      )
      return 'unexpected success'
    } catch (error) {
      return error.name
    }
  }, bytes)
  expect(result).toBe('AbortError')
})

test('compression fields switch modes, work on mobile, and download actual image output', async ({
  page,
}) => {
  await page.goto('/tool/image-compress')
  const bytes = await imageSample(page)
  await expect(page.getByRole('spinbutton', { name: '图片质量（1–100）' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: '目标大小（每个文件）' })).toHaveCount(0)
  await selectChoice(page.getByRole('combobox', { name: '压缩方式' }), 'target')
  await expect(page.getByRole('spinbutton', { name: '图片质量（1–100）' })).toHaveCount(0)
  await page.getByRole('spinbutton', { name: '目标大小（每个文件）' }).fill('4')
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'noise.png', mimeType: 'image/png', buffer: Buffer.from(bytes) })
  await page.getByRole('button', { name: '开始处理' }).click()
  await expect(page.locator('.ui-result')).toContainText('目标 ≤ 4.00 KiB')
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 noise-compressed.webp' }).click()
  expect((await downloaded).suggestedFilename()).toBe('noise-compressed.webp')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(
    () => document.querySelector('.sidebar')!.getBoundingClientRect().right <= 0,
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '../.site-build/compression-image-mobile.png', fullPage: true })
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '压缩方式' })).toHaveAttribute(
    'data-value',
    'manual',
  )
  await page.goto('/tool/video-compress')
  await selectChoice(page.getByRole('combobox', { name: '压缩方式' }), 'target')
  await expect(page.getByRole('combobox', { name: '目标模式音轨' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: '视频码率（kbps）' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: '../.site-build/compression-video-mobile.png', fullPage: true })
})
