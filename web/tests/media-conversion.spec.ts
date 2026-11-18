import { test, expect, type Page } from '@playwright/test'
import { ZipReader, Uint8ArrayReader } from '@zip.js/zip.js'

test.setTimeout(90000)
function wavSample() {
  const rate = 48000,
    frames = rate * 2,
    bytes = new Uint8Array(44 + frames * 2),
    view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) =>
    [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, frames * 2, true)
  for (let index = 0; index < frames; index++)
    view.setInt16(44 + index * 2, Math.sin((index / rate) * Math.PI * 2 * 440) * 8000, true)
  return bytes
}
async function execute(
  page: Page,
  id: string,
  name: string,
  bytes: number[],
  values: Record<string, string | number>,
) {
  return page.evaluate(
    async ({ id, name, bytes, values }) => {
      const path = '/src/tools/index.ts'
      const { toolRegistry } = await import(path)
      const result = await toolRegistry.run(
        id,
        {
          ...toolRegistry.get(id).initialValues,
          ...values,
          files: [new File([new Uint8Array(bytes)], name)],
        },
        { locale: 'en', signal: new AbortController().signal, onProgress: () => {} },
      )
      return {
        name: result.files[0].name,
        bytes: Array.from(new Uint8Array(await result.files[0].blob.arrayBuffer())) as number[],
      }
    },
    { id, name, bytes, values },
  )
}
for (const format of ['wav', 'mp3', 'flac', 'm4a', 'ogg']) {
  test(`real audio conversion to ${format} produces a readable two-second track`, async ({
    page,
  }) => {
    await page.goto('/')
    const result = await execute(page, 'audio-convert', 'tone.wav', Array.from(wavSample()), {
      format,
    })
    const info = await page.evaluate(async (bytes) => {
      const path = '/node_modules/.vite/deps/mediabunny.js'
      const { Input, ALL_FORMATS, BlobSource } = await import(path)
      const input = new Input({
        source: new BlobSource(new Blob([new Uint8Array(bytes)])),
        formats: ALL_FORMATS,
      })
      try {
        return {
          duration: await input.computeDuration(),
          audio: !!(await input.getPrimaryAudioTrack()),
        }
      } finally {
        input.dispose()
      }
    }, result.bytes)
    expect(info.audio).toBe(true)
    expect(info.duration).toBeGreaterThan(1.9)
    expect(info.duration).toBeLessThan(2.2)
  })
}
async function videoSample(page: Page) {
  return page.evaluate(async () => {
    const path = '/node_modules/.vite/deps/mediabunny.js'
    const { Output, WebMOutputFormat, BufferTarget, CanvasSource, AudioBufferSource } =
      await import(path)
    const target = new BufferTarget(),
      output = new Output({ target, format: new WebMOutputFormat() })
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const video = new CanvasSource(canvas, { codec: 'vp9', bitrate: 300000 }),
      audio = new AudioBufferSource({ codec: 'opus', bitrate: 96000 })
    output.addVideoTrack(video, { frameRate: 10 })
    output.addAudioTrack(audio)
    await output.start()
    const buffer = new AudioBuffer({ length: 96000, sampleRate: 48000, numberOfChannels: 1 })
    const samples = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index++)
      samples[index] = Math.sin((index / 48000) * Math.PI * 880) * 0.2
    const audioDone = audio.add(buffer)
    for (let frame = 0; frame < 20; frame++) {
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = frame < 10 ? '#2255ee' : '#ff9900'
      ctx.fillRect(0, 0, 160, 90)
      await video.add(frame / 10, 0.1)
    }
    await audioDone
    await output.finalize()
    return Array.from(new Uint8Array(target.buffer)) as number[]
  })
}
test('video conversion retains video and audio, audio extraction trims, and frame ZIP has timestamps', async ({
  page,
}) => {
  await page.goto('/')
  // Ensure the normal optimized browser module exists before generating the fixture.
  await execute(page, 'audio-convert', 'tone.wav', Array.from(wavSample()), { format: 'wav' })
  const bytes = await videoSample(page)
  for (const format of ['mp4', 'webm']) {
    const result = await execute(page, 'video-convert', 'sample.webm', bytes, {
      format,
      resolution: 'original',
    })
    const tracks = await page.evaluate(async (bytes) => {
      const path = '/node_modules/.vite/deps/mediabunny.js'
      const { Input, BlobSource, ALL_FORMATS } = await import(path)
      const input = new Input({
        source: new BlobSource(new Blob([new Uint8Array(bytes)])),
        formats: ALL_FORMATS,
      })
      try {
        return {
          audio: !!(await input.getPrimaryAudioTrack()),
          video: !!(await input.getPrimaryVideoTrack()),
        }
      } finally {
        input.dispose()
      }
    }, result.bytes)
    expect(tracks).toEqual({ audio: true, video: true })
  }
  const audio = await execute(page, 'video-audio', 'sample.webm', bytes, {
    format: 'wav',
    start: 0.5,
    duration: 0.7,
  })
  const view = new DataView(new Uint8Array(audio.bytes).buffer)
  // WAVE file contains substantially less than the two-second source.
  expect(view.byteLength).toBeGreaterThan(20000)
  expect(view.byteLength).toBeLessThan(100000)
  const frames = await execute(page, 'video-frames', 'sample.webm', bytes, {
    format: 'png',
    start: 0,
    interval: 0.5,
    count: 4,
  })
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(frames.bytes)))
  const entries = await reader.getEntries()
  expect(entries.filter((entry) => entry.filename.endsWith('.png'))).toHaveLength(4)
  expect(entries.some((entry) => entry.filename === 'frames.json')).toBe(true)
  await reader.close()
})
