import { expect, test } from '@playwright/test'
import MidiPackage from '@tonejs/midi'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { selectChoice } from './helpers/controls'

const { Midi } = MidiPackage

test.beforeEach(async ({ context }) => {
  // Use the actual local models and runtimes against both dev and final builds.
  await context.route('https://toolbox.owo.lat/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (!/^\/(runtime\/(ffmpeg|tfjs)\/|models\/basic-pitch\/)[\w./-]+$/.test(path))
      return route.abort()
    return route.fulfill({
      path: fileURLToPath(new URL(`../../docs${path}`, import.meta.url)),
      contentType: path.endsWith('.wasm')
        ? 'application/wasm'
        : path.endsWith('.js')
          ? 'text/javascript'
          : path.endsWith('.json')
            ? 'application/json'
            : 'application/octet-stream',
    })
  })
})

for (const format of ['wav', 'mp3']) {
  test(`${format}: audio and MIDI round trip preserves notes after three minutes`, async ({
    page,
  }) => {
    test.setTimeout(240000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const source = new Midi()
    source.addTrack().addNote({ midi: 60, time: 181, duration: 1.5, velocity: 0.8 })
    await page.goto('/tool/midi-audio')
    await page.locator('input[type=file]').setInputFiles({
      name: 'long.mid',
      mimeType: 'audio/midi',
      buffer: Buffer.from(source.toArray()),
    })
    await selectChoice(page.getByLabel('输出格式', { exact: true }), format)
    await selectChoice(page.getByLabel('采样率', { exact: true }), '22050')
    await selectChoice(page.getByLabel('合成音色', { exact: true }), 'piano')
    await page.getByRole('button', { name: '开始处理', exact: true }).click()
    await expect(page.locator('.ui-result')).toBeVisible({ timeout: 60000 })
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: `下载 long.${format}`, exact: true }).click()
    const bytes = await readFile((await (await downloading).path())!)
    if (format === 'wav') {
      expect((bytes.length - 44) / 4 / 22050).toBeCloseTo(183.3)
      let energy = 0
      for (let frame = 181.2 * 22050; frame < 181.3 * 22050; frame++)
        energy += Math.abs(bytes.readInt16LE(44 + Math.floor(frame) * 4))
      expect(energy).toBeGreaterThan(10000)
    }
    await page.getByRole('button', { name: 'English', exact: true }).click()
    await expect(page).toHaveTitle('MIDI to audio · DogOfFurina Toolbox')
    await expect(page.locator('.ui-result')).toContainText('Rendered')

    await page.goto('/tool/audio-midi')
    if (format === 'mp3') {
      // Force the real fallback decoder, even when this browser supports MP3.
      await page.evaluate(() => {
        OfflineAudioContext.prototype.decodeAudioData = () =>
          Promise.reject(new DOMException('Exercise FFmpeg fallback', 'EncodingError'))
      })
    }
    await page.locator('input[type=file]').setInputFiles({
      name: `long.${format}`,
      mimeType: format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      buffer: bytes,
    })
    await page.getByRole('button', { name: 'Run tool', exact: true }).click()
    await expect(page.locator('.ui-result, .error-message')).toBeVisible({ timeout: 180000 })
    await expect(page.locator('.error-message')).toHaveCount(0)
    await expect(page.locator('.ui-result')).toContainText('notes to MIDI')
    const midiDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download long.mid', exact: true }).click()
    const parsed = new Midi(await readFile((await (await midiDownload).path())!))
    const lateNotes = parsed.tracks
      .flatMap((track) => track.notes)
      .filter((note) => note.time > 180)
    expect(lateNotes.map((note) => note.midi)).toContain(60)
    expect(parsed.duration).toBeGreaterThan(181.5)
    expect(parsed.duration).toBeLessThan(184)
    expect(errors).toEqual([])
  })
}
