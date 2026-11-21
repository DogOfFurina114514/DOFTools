import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { test, expect } from '@playwright/test'

// Small, deterministic resources exercise the production worker without a
// network dependency or repeatedly downloading the real 900 MB model.
const pages = 'https://toolbox.owo.lat/'
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const weights = Buffer.from(Array.from({ length: 3 * 1024 * 1024 + 31 }, (_, index) => index % 251))
const documents = (version: number) =>
  new Map<string, Buffer>([
    [
      'index.html',
      Buffer.from(
        `<html><body><h1>Offline ${version}</h1><button onclick="import('/assets/lazy-${version}.js').then(m=>document.querySelector('output').textContent=m.value)">Tool</button><output></output></body></html>`,
      ),
    ],
    [`assets/lazy-${version}.js`, Buffer.from(`export const value='tool ${version}'`)],
    ['models/test/weights.part-000', weights],
    ['runtime/test.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])],
  ])
const manifests = [1, 2].map((version) => {
  const resources = [...documents(version)].map(([path, data]) => ({
    path,
    bytes: data.length,
    hash: hash(data),
    blocks: Array.from({ length: Math.ceil(data.length / (128 * 1024)) }, (_, index) =>
      hash(data.subarray(index * 128 * 1024, (index + 1) * 128 * 1024)),
    ),
    group: path.startsWith('models/') ? 'model' : 'site',
    aiRequired: path.startsWith('models/'),
    source: /^(models|runtime)\//.test(path) ? 'pages' : 'site',
    type: path.endsWith('.html')
      ? 'text/html'
      : path.endsWith('.js')
        ? 'text/javascript'
        : 'application/octet-stream',
  }))
  return {
    format: 1,
    version: `26.1.${version - 1}`,
    revision: hash(Buffer.from(JSON.stringify(resources))),
    resources,
  }
})
let server: Server
let base = ''
let worker = ''
let cacheTools = ''
let version = 1
let fail = false
let pause: (() => Promise<void>) | undefined
let downloads = 0
test.beforeAll(async () => {
  worker = (
    await build({
      entryPoints: [fileURLToPath(new URL('../src/offline.worker.ts', import.meta.url))],
      bundle: true,
      write: false,
      format: 'iife',
      target: 'es2022',
      define: {
        __OFFLINE_MANIFEST__: JSON.stringify(manifests[0]),
        'import.meta.env.DEV': 'false',
      },
    })
  ).outputFiles[0].text
  cacheTools = (
    await build({
      entryPoints: [fileURLToPath(new URL('../src/lib/resource-cache.ts', import.meta.url))],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: 'resourceCache',
      target: 'es2022',
    })
  ).outputFiles[0].text
  server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname.slice(1) || 'index.html'
    if (path === 'sw.js') {
      response.setHeader('content-type', 'text/javascript')
      response.end(worker)
      return
    }
    if (path === 'offline-manifest.json') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify(manifests[version - 1]))
      return
    }
    if (fail && path === 'assets/lazy-2.js') {
      response.writeHead(404)
      response.end()
      return
    }
    const data =
      documents(version).get(path) ??
      documents(1).get(path) ??
      documents(version).get('index.html')!
    response.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : 'text/html')
    response.end(data)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

test('persists ranges, navigates offline, updates atomically and clears in-flight saves', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000)
  await context.route(`${pages}**`, async (route) => {
    downloads++
    if (pause) await pause()
    const path = new URL(route.request().url()).pathname.slice(1)
    const data = documents(version).get(path)!
    const range = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers()['range'] ?? '')
    const body = range ? data.subarray(Number(range[1]), Number(range[2]) + 1) : data
    await route
      .fulfill({
        body,
        status: range ? 206 : 200,
        headers: {
          'access-control-allow-origin': '*',
          'content-type': 'application/octet-stream',
          // Deliberately omit Access-Control-Expose-Headers, like real Pages.
          ...(range ? { 'content-range': `bytes ${range[1]}-${range[2]}/${data.length}` } : {}),
        },
      })
      .catch(() => {})
  })
  await context.addInitScript(() => {
    ;(window as unknown as { resourceEvents: unknown[] }).resourceEvents = []
    navigator.serviceWorker.addEventListener('message', ({ data }) => {
      const target = window as unknown as {
        resourceEvents: unknown[]
        resourceStatus: { phase: string; version: string; modelsBytes: number }
      }
      target.resourceEvents.push(data)
      if (data.type === 'resource-status') target.resourceStatus = data.state
    })
  })
  const command = (type: string, enabled?: boolean) =>
    page.evaluate(
      async ({ type, enabled }) => {
        return new Promise<{ ok: boolean; state: { phase: string; modelsBytes: number } }>(
          (resolve) => {
            const channel = new MessageChannel()
            channel.port1.onmessage = ({ data }) => {
              channel.port1.close()
              resolve(data)
            }
            navigator.serviceWorker.controller!.postMessage({ type, enabled, threads: 64 }, [
              channel.port2,
            ])
          },
        )
      },
      { type, enabled },
    )
  const status = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            resourceStatus: {
              phase: string
              version: string
              modelsBytes: number
              modelPhase: string
              aiReady: boolean
            }
          }
        ).resourceStatus,
    )
  await page.goto(base)
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      )
  })
  await command('startup', false)
  const readRange = () =>
    page.evaluate(async (url) => {
      const response = await fetch(url, { headers: { range: 'bytes=0-524287' } })
      return {
        status: response.status,
        source: response.headers.get('x-fufu-resource-source'),
        bytes: (await response.arrayBuffer()).byteLength,
      }
    }, `${pages}models/test/weights.part-000`)
  expect((await readRange()).bytes).toBe(512 * 1024)
  expect((await command('status')).state.modelsBytes).toBe(512 * 1024)
  const before = downloads
  await page.reload()
  expect(await readRange()).toEqual({ status: 206, source: 'local', bytes: 512 * 1024 })
  expect(downloads).toBe(before)

  await command('enable')
  await expect.poll(async () => (await status()).phase).toBe('ready')
  expect((await status()).modelsBytes).toBe(512 * 1024)
  expect((await status()).aiReady).toBe(false)
  expect(
    await page.evaluate(() =>
      (window as unknown as { resourceEvents: { type: string }[] }).resourceEvents.some(
        (event) => event.type === 'offline-ready',
      ),
    ),
  ).toBe(true)
  await context.setOffline(true)
  const offlinePage = await context.newPage()
  await offlinePage.goto(`${base}/tool/demo`)
  await expect(offlinePage.locator('h1')).toHaveText('Offline 1')
  await offlinePage.getByRole('button', { name: 'Tool' }).click()
  await expect(offlinePage.locator('output')).toHaveText('tool 1')
  await offlinePage.close()
  await context.setOffline(false)

  version = 2
  fail = true
  const modelDownloads = downloads
  await command('startup', true)
  await expect.poll(async () => (await status()).phase).toBe('error')
  expect(downloads).toBe(modelDownloads)
  await context.setOffline(true)
  await page.goto(`${base}/settings`)
  await expect(page.locator('h1')).toHaveText('Offline 1')
  await context.setOffline(false)
  fail = false
  await command('retry')
  await expect.poll(async () => (await status()).phase).toBe('ready')
  expect((await status()).version).toBe('26.1.1')
  expect(downloads).toBe(modelDownloads)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('h1')).toHaveText('Offline 2')
  await context.setOffline(false)

  await command('download-models')
  await expect.poll(async () => (await status()).modelPhase).toBe('ready')
  expect((await status()).modelsBytes).toBe(weights.length)
  expect((await status()).aiReady).toBe(true)
  await command('disable')
  expect((await status()).modelsBytes).toBe(weights.length)
  await command('enable')
  await expect.poll(async () => (await status()).phase).toBe('ready')
  expect((await status()).modelsBytes).toBe(weights.length)
  await command('clear-models')
  expect((await command('status')).state.modelsBytes).toBe(0)
  expect((await status()).phase).toBe('ready')
  const beforeModelRetry = downloads
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  pause = () => waiting
  await command('download-models')
  await expect.poll(() => downloads).toBeGreaterThan(beforeModelRetry)
  const cleared = await command('clear-models')
  expect(cleared.state.modelsBytes).toBe(0)
  release()
  pause = undefined
  await expect.poll(async () => (await command('status')).state.modelsBytes).toBe(0)
  expect((await status()).phase).toBe('ready')
  expect((await status()).modelPhase).toBe('idle')
  await page.addScriptTag({ content: cacheTools })
  const epoch = await page.evaluate(async () => {
    const cache = (
      window as unknown as { resourceCache: { resourceControl(): Promise<{ modelEpoch: number }> } }
    ).resourceCache
    return (await cache.resourceControl()).modelEpoch
  })
  await command('clear-models')
  await page.evaluate(
    async ({ resource, data, epoch }) => {
      const cache = (
        window as unknown as {
          resourceCache: {
            saveResourceBytes(
              resource: unknown,
              start: number,
              data: Uint8Array,
              epoch: number,
            ): Promise<void>
          }
        }
      ).resourceCache
      await cache.saveResourceBytes(resource, 0, new Uint8Array(data), epoch)
    },
    {
      resource: manifests[0].resources.find((resource) => resource.group === 'model')!,
      data: [...weights.subarray(0, 128 * 1024)],
      epoch,
    },
  )
  expect((await command('status')).state.modelsBytes).toBe(0)
  await context.serviceWorkers()[0].evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'blocks') throw new DOMException('Storage is full', 'QuotaExceededError')
      return original.call(this, value, key)
    }
  })
  await command('download-models')
  await expect.poll(async () => (await status()).modelPhase).toBe('error')
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { resourceStatus: { modelError: string } }).resourceStatus.modelError,
    ),
  ).toBe('quota')
  expect((await status()).phase).toBe('ready')
})
