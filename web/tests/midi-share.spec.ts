import { test, expect } from '@playwright/test'
import { selectChoice } from './helpers/controls'
import MidiPackage from '@tonejs/midi'
import { readFile } from 'node:fs/promises'
const { Midi } = MidiPackage

test('MIDI to audio exports a real, audible WAV and translates with the page', async ({ page }) => {
  test.setTimeout(90000)
  const midi = new Midi()
  midi.header.setTempo(90)
  midi.addTrack().addNote({ midi: 69, time: 0, duration: 1, velocity: 0.8 })
  await page.goto('/tool/midi-audio')
  await page.locator('input[type=file]').setInputFiles({
    name: 'melody.mid',
    mimeType: 'audio/midi',
    buffer: Buffer.from(midi.toArray()),
  })
  await selectChoice(page.getByLabel('合成音色', { exact: true }), 'sine')
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.locator('.ui-result')).toContainText('立体声 WAV')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 melody.wav', exact: true }).click()
  const bytes = await readFile((await (await downloading).path())!)
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
  expect(bytes.readUInt32LE(24)).toBe(44100)
  const audio = await page.evaluate(async (bytes) => {
    const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(
      new Uint8Array(bytes).buffer,
    )
    const samples = buffer.getChannelData(0)
    let peak = 0,
      crossings = 0
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
    for (let i = 4410; i < 39690; i++) if (samples[i] <= 0 && samples[i + 1] > 0) crossings++
    return { duration: buffer.duration, peak, hz: crossings / 0.8 }
  }, Array.from(bytes))
  expect(audio.duration).toBeCloseTo(1.8, 1)
  expect(audio.peak).toBeGreaterThan(0.05)
  expect(audio.hz).toBeCloseTo(440, 0)
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page).toHaveTitle('MIDI to audio · DogOfFurina Toolbox')
  await expect(page.locator('.ui-result')).toContainText('Rendered')
})

test('real local Basic Pitch weights transcribe a piano chord to valid MIDI', async ({ page }) => {
  test.setTimeout(120000)
  const midi = new Midi()
  for (const pitch of [60, 64, 67])
    midi.addTrack().addNote({ midi: pitch, time: 0.15, duration: 1.5, velocity: 0.7 })
  await page.goto('/')
  const wav = await page.evaluate(async (bytes) => {
    const entry = '/src/tools/index.ts'
    const { toolRegistry } = await import(entry)
    const tool = toolRegistry.get('midi-audio')
    const result = await toolRegistry.run(
      tool.id,
      {
        ...tool.initialValues,
        instrument: 'piano',
        sampleRate: '22050',
        files: [new File([new Uint8Array(bytes)], 'chord.mid')],
      },
      { locale: 'en', signal: new AbortController().signal, onProgress: () => {} },
    )
    return Array.from(new Uint8Array(await result.files[0].blob.arrayBuffer()))
  }, Array.from(midi.toArray()))
  await page.goto('/tool/audio-midi')
  const external: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:5173') && request.url().startsWith('http'))
      external.push(request.url())
  })
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'chord.wav', mimeType: 'audio/wav', buffer: Buffer.from(wav) })
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.locator('.ui-result, .error-message')).toBeVisible({ timeout: 100000 })
  await expect(page.locator('.error-message')).toHaveCount(0)
  await expect(page.locator('.ui-result')).toContainText('生成 MIDI')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 chord.mid', exact: true }).click()
  const parsed = new Midi(await readFile((await (await downloading).path())!))
  const pitches = parsed.tracks.flatMap((track) => track.notes.map((note) => note.midi))
  expect(pitches).toEqual(expect.arrayContaining([60, 64, 67]))
  expect(parsed.duration).toBeGreaterThan(0.5)
  expect(parsed.duration).toBeLessThan(3)
  expect(external).toEqual([])
})

test('anonymous share parsing obtains download URLs and exports bilingual results', async ({
  page,
}) => {
  const calls: URL[] = []
  await page.route('https://lz.qaiu.top/**', async (route) => {
    const url = new URL(route.request().url())
    calls.push(url)
    expect(url.pathname).toBe('/json/parser')
    await route.fulfill({
      json: {
        code: 200,
        success: true,
        data: {
          directLink: 'https://download.example/sample.mid',
          fileInfo: { fileId: 'file1', fileName: 'sample.mid', fileType: 'file', size: 1000 },
        },
      },
    })
  })
  await page.goto('/tool/share-link')
  await expect(page.getByLabel('解析服务地址（可选）', { exact: true })).toHaveCount(0)
  await page
    .getByLabel('分享链接或分享文案', { exact: true })
    .fill('https://wwt.lanzouw.com/iAb123 提取码：abcd\nhttps://www.ilanzou.com/s/Xyz?code=efgh')
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.locator('.share-preview')).toHaveCount(2)
  await expect(page.getByRole('link', { name: '下载文件' }).first()).toHaveAttribute(
    'href',
    'https://download.example/sample.mid',
  )
  expect(calls.map((url) => url.searchParams.get('pwd'))).toEqual(['abcd', 'efgh'])
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 share-links.json', exact: true }).click()
  const data = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'))
  expect(data.shares.map((share: { password: string }) => share.password)).toEqual(['abcd', 'efgh'])
  expect(data.shares[0].files[0].url).toBe('https://download.example/sample.mid')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page).toHaveTitle('Cloud drive link parser · DogOfFurina Toolbox')
  await expect(page.locator('.share-preview').last()).toContainText('Lanzou Premium')
  await expect(page.locator('.ui-result')).toContainText('Resolved 2 / 2')
})

test('public resolver browses folders, blocks large files and refreshes download URLs', async ({
  page,
}) => {
  const calls: URL[] = []
  await page.route('https://lz.qaiu.top/**', async (route) => {
    const url = new URL(route.request().url())
    calls.push(url)
    await route.fulfill({
      json: url.pathname.includes('getFileDownInfo')
        ? {
            downloadUrl: 'https://download.example/sample.mid',
            downloadHeaders: {},
            needDownloader: false,
          }
        : {
            code: 200,
            success: true,
            data: url.searchParams.get('dirId')
              ? [
                  {
                    fileId: 'song',
                    fileName: 'sample.mid',
                    fileType: 'file',
                    size: 1000,
                    parserUrl: 'https://lz0.qaiu.top/v2/redirectUrl/lz/songParam',
                  },
                  {
                    fileId: 'large',
                    fileName: 'large.zip',
                    fileType: 'file',
                    size: 101 * 1024 * 1024,
                  },
                ]
              : [{ fileId: 'folder', fileName: 'Music', fileType: 'folder' }],
          },
    })
  })
  await page.goto('/tool/share-link')
  await page
    .getByLabel('分享链接或分享文案', { exact: true })
    .fill('https://wwt.lanzouw.com/bAb123?pwd=abcd')
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await page.getByRole('button', { name: '打开文件夹', exact: true }).click()
  await expect(page.locator('.share-files li').last()).toContainText('仅支持 ≤100 MiB')
  await expect(page.getByRole('button', { name: '获取直链', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: '获取直链', exact: true }).click()
  await expect(page.getByRole('link', { name: '下载文件' })).toHaveAttribute(
    'href',
    'https://download.example/sample.mid',
  )
  expect(
    calls.map((url) => [url.pathname, url.searchParams.get('dirId'), url.searchParams.get('pwd')]),
  ).toEqual([
    ['/v2/getFileList', null, 'abcd'],
    ['/v2/getFileList', 'folder', 'abcd'],
    ['/v2/getFileDownInfo/lz/songParam', null, null],
  ])
  await page.getByRole('button', { name: '重新获取直链', exact: true }).click()
  await expect.poll(() => calls.length).toBe(4)
  await page.getByRole('button', { name: '返回上级', exact: true }).click()
  await expect(page.getByRole('button', { name: '打开文件夹', exact: true })).toBeVisible()
})

test('failed anonymous shares remain retryable and unsupported drives make no requests', async ({
  page,
}) => {
  let requests = 0
  await page.route('https://lz.qaiu.top/**', async (route) => {
    requests++
    await route.fulfill({ status: 503, json: { code: 503, success: false, msg: '服务暂时不可用' } })
  })
  await page.goto('/tool/share-link')
  await page.getByLabel('分享链接或分享文案', { exact: true }).fill('https://pan.baidu.com/s/1abc')
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('仅支持蓝奏云')
  expect(requests).toBe(0)
  await page
    .getByLabel('分享链接或分享文案', { exact: true })
    .fill('https://wwt.lanzouw.com/iAb123?pwd=abcd')
  await page.getByRole('button', { name: '开始处理', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('服务暂时不可用')
  await expect(page.locator('.share-preview')).toContainText('abcd')
  await page.unroute('https://lz.qaiu.top/**')
  await page.route('https://lz.qaiu.top/**', (route) =>
    route.fulfill({
      json: {
        code: 200,
        success: true,
        data: {
          directLink: 'https://download.example/small.txt',
          fileInfo: { fileId: 'small', fileName: 'small.txt', size: 20, fileType: 'file' },
        },
      },
    }),
  )
  await page.getByRole('button', { name: '获取文件列表', exact: true }).click()
  await expect(page.getByRole('link', { name: '下载文件' })).toHaveAttribute(
    'href',
    'https://download.example/small.txt',
  )
  await expect(page.getByRole('alert')).toHaveCount(0)
})
