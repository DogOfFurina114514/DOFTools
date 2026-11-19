import { test, expect } from '@playwright/test'
import MidiPackage from '@tonejs/midi'
const { Midi } = MidiPackage

test('both MIDI tools are visible in the audio category', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/category/audio')
  await expect(page.getByRole('link', { name: /音频转 MIDI/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /MIDI 转音频/ })).toBeVisible()
})

for (const format of [
  'wav',
  'mp3',
  'flac',
  'm4a',
  'aac',
  'ogg',
  'opus',
  'webm',
  'aiff',
  'wma',
  'alac',
]) {
  test(`${format}: actual MIDI encoding and audio transcription round trip`, async ({ page }) => {
    test.setTimeout(120000)
    const midi = new Midi()
    midi.addTrack().addNote({ midi: 60, time: 0.15, duration: 1.5, velocity: 0.8 })
    await page.goto('/tool/midi-audio')
    const result = await page.evaluate(
      async ({ bytes, format }) => {
        const entry = '/src/tools/index.ts'
        const { toolRegistry } = await import(entry)
        const context = { locale: 'en', signal: new AbortController().signal, onProgress: () => {} }
        const render = toolRegistry.get('midi-audio')
        const output = await toolRegistry.run(
          render.id,
          {
            ...render.initialValues,
            format,
            instrument: 'piano',
            files: [new File([new Uint8Array(bytes)], 'roundtrip.mid')],
          },
          context,
        )
        const encoded = output.files[0]
        const transcribe = toolRegistry.get('audio-midi')
        const input = await toolRegistry.run(
          transcribe.id,
          {
            ...transcribe.initialValues,
            files: [new File([encoded.blob], encoded.name, { type: encoded.blob.type })],
          },
          context,
        )
        return {
          name: encoded.name,
          mime: encoded.blob.type,
          size: encoded.blob.size,
          midi: Array.from(new Uint8Array(await input.files[0].blob.arrayBuffer())),
        }
      },
      { bytes: Array.from(midi.toArray()), format },
    )
    expect(result.name).toBe(`roundtrip.${format === 'alac' ? 'm4a' : format}`)
    expect(result.mime).toMatch(/^audio\//)
    expect(result.size).toBeGreaterThan(1000)
    const parsed = new Midi(new Uint8Array(result.midi))
    expect(parsed.tracks.flatMap((track) => track.notes.map((note) => note.midi))).toContain(60)
    expect(parsed.duration).toBeGreaterThan(1)
    expect(parsed.duration).toBeLessThan(3)
  })
}

test('codec limits and Opus fallback produce decodable audio', async ({ page }) => {
  test.setTimeout(120000)
  const midi = new Midi()
  midi.addTrack().addNote({ midi: 69, time: 0, duration: 0.5, velocity: 0.8 })
  await page.goto('/tool/midi-audio')
  const results = await page.evaluate(async (bytes) => {
    const entry = '/src/tools/index.ts'
    const { toolRegistry } = await import(entry)
    const tool = toolRegistry.get('midi-audio')
    const wav = await toolRegistry.run(
      tool.id,
      { ...tool.initialValues, files: [new File([new Uint8Array(bytes)], 'limits.mid')] },
      { locale: 'en', signal: new AbortController().signal, onProgress: () => {} },
    )
    const buffer = await wav.files[0].blob.arrayBuffer()
    const results = []
    for (const [format, sampleRate] of [
      ['mp3', 22050],
      ['ogg', 22050],
      ['wma', 22050],
      ['aac', 48000],
      ['opus', 48000],
      ['webm', 48000],
    ]) {
      const worker = new Worker('/tests/fixtures/midi-codec.worker.ts', { type: 'module' })
      results.push(
        await new Promise((resolve) => {
          worker.onmessage = ({ data }) => {
            worker.terminate()
            resolve({ format, ...data })
          }
          worker.onerror = () => {
            worker.terminate()
            resolve({ format, error: 'worker failed' })
          }
          worker.postMessage({ wav: buffer, format, sampleRate })
        }),
      )
    }
    return results
  }, Array.from(midi.toArray()))
  for (const result of results) {
    expect(result, JSON.stringify(result)).not.toHaveProperty('error')
    expect(result.size).toBeGreaterThan(1000)
    expect(result.samples).toBeGreaterThan(22050 / 2)
    expect(result.peak).toBeGreaterThan(0.05)
  }
})
