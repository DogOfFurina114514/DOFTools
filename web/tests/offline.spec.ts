import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { test, expect, type Page } from '@playwright/test'

// Small, deterministic resources exercise the production worker without a
// network dependency or repeatedly downloading the real 900 MB model.
const pages = 'https://toolbox.owo.lat/'
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const weights = Buffer.from(Array.from({ length: 3 * 1024 * 1024 + 31 }, (_, index) => index % 251))
const documentCache = new Map<number, Map<string, Buffer>>()
const bundleCache = new Map<
  number,
  {
    path: string
    hash: string
    bytes: number
    decodedBytes: number
    source: string
    members: { path: string; start: number; offset: number; bytes: number }[]
  }[]
>()
const documents = (version: number) => {
  if (documentCache.has(version)) return documentCache.get(version)!
  const files = new Map<string, Buffer>([
    [
      'index.html',
      Buffer.from(
        `<html><body><h1>Offline ${version}</h1><button onclick="import('/assets/lazy-${version}.js').then(m=>document.querySelector('output').textContent=m.value)">Tool</button><output></output></body></html>`,
      ),
    ],
    [`assets/lazy-${version}.js`, Buffer.from(`export const value='tool ${version}'`)],
    ['assets/cold-worker.js', Buffer.from('self.onmessage=({data})=>self.postMessage(data+1)')],
    ['models/test/weights.part-000', weights],
    ['runtime/test.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])],
    ['runtime/site.wasm', weights],
    [
      'assets/delta.bin',
      Buffer.concat(
        (version === 1 ? [17, 23, 31] : [31, 67, 17]).map((value) =>
          Buffer.alloc(128 * 1024, value),
        ),
      ),
    ],
  ])
  const index = files.get('index.html')!
  files.set(`offline/index.${hash(index)}.bin`, index)
  const bundles: ReturnType<typeof bundleCache.get> = []
  const add = (source: string, members: { path: string; start: number; bytes: number }[]) => {
    let offset = 0
    const decoded = Buffer.concat(
      members.map((member) =>
        files.get(member.path)!.subarray(member.start, member.start + member.bytes),
      ),
    )
    const data = gzipSync(decoded)
    const path = `offline/bundle.${hash(decoded)}.bin`
    bundles.push({
      path,
      hash: hash(decoded),
      bytes: data.length,
      decodedBytes: decoded.length,
      source,
      members: members.map((member) => {
        const next = { ...member, offset }
        offset += member.bytes
        return next
      }),
    })
    files.set(path, data)
  }
  add('site', [
    { path: 'index.html', start: 0, bytes: index.length },
    {
      path: `assets/lazy-${version}.js`,
      start: 0,
      bytes: files.get(`assets/lazy-${version}.js`)!.length,
    },
  ])
  for (let start = 0; start < 3 * 1024 * 1024; start += 1024 * 1024)
    add('pages', [{ path: 'runtime/site.wasm', start, bytes: 1024 * 1024 }])
  bundleCache.set(version, bundles)
  documentCache.set(version, files)
  return files
}
const manifests = [1, 2].map((version) => {
  const resources = [...documents(version)]
    .filter(([path]) => !path.startsWith('offline/'))
    .map(([path, data]) => ({
      path,
      ...(path === 'index.html' ? { downloadPath: `offline/index.${hash(data)}.bin` } : {}),
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
    bundles: bundleCache.get(version),
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
let indexDownloads = 0
let siteRanges: string[] = []
let corruptIndex = false
let useBundles = true
let corruptBundle = false
let missingBundles = false
let toolFault = ''
let faultPath = ''
let toolAttempts = 0
let deltaRanges: string[] = []
let localDownloads: string[] = []
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
      response.end(
        JSON.stringify({
          ...manifests[version - 1],
          bundles: useBundles ? manifests[version - 1].bundles : undefined,
        }),
      )
      return
    }
    localDownloads.push(path)
    if (path === 'assets/delta.bin') deltaRanges.push(request.headers.range ?? 'full')
    if (path === faultPath && ++toolAttempts === 1) {
      if (toolFault === 'http') {
        response.writeHead(503)
        response.end('Temporary CDN failure')
        return
      }
      if (toolFault === 'network') {
        request.socket.destroy()
        return
      }
      if (toolFault === 'truncated') {
        response.setHeader('content-length', '999')
        response.end('partial')
        return
      }
    }
    if (fail && (path === 'assets/lazy-2.js' || path === bundleCache.get(2)![0].path)) {
      response.writeHead(404)
      response.end()
      return
    }
    if (missingBundles && path.startsWith('offline/bundle.')) {
      response.writeHead(404)
      response.end()
      return
    }
    let data =
      documents(version).get(path) ??
      documents(1).get(path) ??
      documents(version).get('index.html')!
    if (path === 'index.html')
      data = Buffer.from(
        data.toString().replace('</body>', '<script>window.proxyInjected=true</script></body>'),
      )
    if (path.startsWith('offline/index.')) {
      indexDownloads++
      if (corruptIndex) {
        data = Buffer.from(data)
        data[0] ^= 1
      }
    }
    if (corruptBundle && path.startsWith('offline/bundle.')) {
      data = Buffer.from(data)
      data[data.length - 1] ^= 1
    }
    const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? '')
    if (range) {
      response.statusCode = 206
      response.setHeader('content-range', `bytes ${range[1]}-${range[2]}/${data.length}`)
      data = data.subarray(Number(range[1]), Number(range[2]) + 1)
    }
    response.setHeader(
      'content-type',
      path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream',
    )
    if (path === 'index.html') response.setHeader('content-type', 'text/html')
    response.end(data)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

async function registerWorker(page: Page) {
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
}
function sendCommand(page: Page, type: string, enabled?: boolean) {
  return page.evaluate(
    async ({ type, enabled }) =>
      new Promise<{ ok: boolean; state: { phase: string; modelsBytes: number } }>((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = ({ data }) => {
          channel.port1.close()
          resolve(data)
        }
        navigator.serviceWorker.controller!.postMessage({ type, enabled, threads: 64 }, [
          channel.port2,
        ])
      }),
    { type, enabled },
  )
}
function resourceStatus(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          resourceStatus: {
            phase: string
            version: string
            modelsBytes: number
            modelPhase: string
            modelError: string
            error: string
            aiReady: boolean
            downloadLoaded: number
            downloadTotal: number
            reusedBytes: number
            updating: boolean
          }
        }
      ).resourceStatus,
  )
}
test.beforeEach(async ({ context }) => {
  version = 1
  fail = false
  corruptIndex = false
  useBundles = true
  corruptBundle = false
  missingBundles = false
  toolFault = ''
  faultPath = ''
  toolAttempts = 0
  deltaRanges = []
  localDownloads = []
  downloads = 0
  indexDownloads = 0
  siteRanges = []
  pause = undefined
  await context.addInitScript(() => {
    ;(window as unknown as { resourceEvents: unknown[] }).resourceEvents = []
    navigator.serviceWorker.addEventListener('message', ({ data }) => {
      const target = window as unknown as { resourceEvents: unknown[]; resourceStatus: unknown }
      target.resourceEvents.push(data)
      if (data.type === 'resource-status') target.resourceStatus = data.state
    })
  })
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
    if (path === 'runtime/site.wasm') siteRanges.push(route.request().headers()['range'])
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
  const command = (type: string, enabled?: boolean) => sendCommand(page, type, enabled)
  const status = () => resourceStatus(page)
  await page.goto(base)
  expect(
    await page.evaluate(() => (window as unknown as { proxyInjected?: boolean }).proxyInjected),
  ).toBe(true)
  await registerWorker(page)
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
  expect((await status()).downloadLoaded).toBeLessThan(weights.length / 2)
  expect(indexDownloads).toBe(0)
  expect(siteRanges).toEqual([`bytes=3145728-${weights.length - 1}`])
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
  expect(
    await offlinePage.evaluate(
      () => (window as unknown as { proxyInjected?: boolean }).proxyInjected,
    ),
  ).toBeUndefined()
  await offlinePage.getByRole('button', { name: 'Tool' }).click()
  await expect(offlinePage.locator('output')).toHaveText('tool 1')
  await offlinePage.close()
  await context.setOffline(false)

  version = 2
  fail = true
  const modelDownloads = downloads
  await command('startup', true)
  // The updated lazy module is inside a compressed site bundle.
  // Reject that bundle to exercise the same atomic-update failure.
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

for (const damaged of [false, true]) {
  test(`incremental updates reuse blocks at new offsets${damaged ? ' and redownload a damaged source' : ''}`, async ({
    context,
    page,
  }) => {
    await context.route(`${pages}**`, async (route) => {
      downloads++
      const path = new URL(route.request().url()).pathname.slice(1)
      const data = documents(version).get(path)!
      const range = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
      await route.fulfill({
        status: range ? 206 : 200,
        body: range ? data.subarray(Number(range[1]), Number(range[2]) + 1) : data,
        contentType: 'application/octet-stream',
        headers: { 'access-control-allow-origin': '*' },
      })
    })
    await page.goto(base)
    await registerWorker(page)
    await sendCommand(page, 'enable')
    await expect.poll(async () => (await resourceStatus(page)).phase).toBe('ready')
    if (damaged)
      await page.evaluate(
        async (hash) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('fufu-resources-v1', 1)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
          const tx = db.transaction('blocks', 'readwrite')
          tx.objectStore('blocks').put({
            key: `site:${hash}:0`,
            group: 'site',
            data: new Uint8Array(128 * 1024),
          })
          await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve()
            tx.onabort = () => reject(tx.error)
          })
          db.close()
        },
        manifests[0].resources.find((resource) => resource.path === 'assets/delta.bin')!.hash,
      )
    version = 2
    deltaRanges = []
    const before = downloads
    await sendCommand(page, 'startup', true)
    await expect.poll(async () => (await resourceStatus(page)).phase).toBe('ready')
    const saved = await resourceStatus(page)
    expect(saved.updating).toBe(true)
    expect(saved.version).toBe('26.1.1')
    expect(downloads).toBe(before)
    expect(deltaRanges).toEqual([damaged ? 'bytes=131072-393215' : 'bytes=131072-262143'])
    const changedSmall = manifests[1].resources
      .filter((resource) => resource.path === 'index.html' || resource.path === 'assets/lazy-2.js')
      .reduce((sum, resource) => sum + resource.bytes, 0)
    expect(saved.reusedBytes).toBe(
      manifests[1].resources
        .filter((resource) => resource.group === 'site')
        .reduce((sum, resource) => sum + resource.bytes, 0) -
        changedSmall -
        (damaged ? 2 : 1) * 128 * 1024,
    )
    expect(saved.downloadTotal).toBe(bundleCache.get(2)![0].bytes + (damaged ? 2 : 1) * 128 * 1024)
    expect(saved.downloadLoaded).toBe(saved.downloadTotal)
    await context.setOffline(true)
    expect(
      await page.evaluate(async (url) => {
        const response = await fetch(url)
        const bytes = new Uint8Array(await response.arrayBuffer())
        return {
          source: response.headers.get('x-fufu-resource-source'),
          blocks: [bytes[0], bytes[131072], bytes[262144]],
          length: bytes.length,
        }
      }, `${base}/assets/delta.bin`),
    ).toEqual({ source: 'local', blocks: [31, 67, 17], length: 393216 })
    await context.setOffline(false)
    const localBefore = [...localDownloads]
    await sendCommand(page, 'startup', true)
    await expect.poll(async () => (await resourceStatus(page)).phase).toBe('ready')
    expect((await resourceStatus(page)).downloadLoaded).toBe(0)
    expect(localDownloads).toEqual(localBefore)
    expect(downloads).toBe(before)
    expect((await resourceStatus(page)).modelsBytes).toBe(0)
  })
}

test('disabling offline use during block reuse prevents cleared resources from returning', async ({
  context,
  page,
}) => {
  await context.route(`${pages}**`, async (route) => {
    const data = documents(version).get(new URL(route.request().url()).pathname.slice(1))!
    const range = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
    await route.fulfill({
      status: range ? 206 : 200,
      body: range ? data.subarray(Number(range[1]), Number(range[2]) + 1) : data,
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  await page.goto(base)
  await registerWorker(page)
  await sendCommand(page, 'enable')
  await expect.poll(async () => (await resourceStatus(page)).phase).toBe('ready')
  const worker = context.serviceWorkers()[0]
  await worker.evaluate(() => {
    const target = self as unknown as { reusing?: boolean; releaseReuse?: () => void }
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    const pending = new Promise<void>((resolve) => {
      target.releaseReuse = resolve
    })
    crypto.subtle.digest = async (...args) => {
      target.reusing = true
      await pending
      crypto.subtle.digest = digest
      return digest(...args)
    }
  })
  version = 2
  await sendCommand(page, 'startup', true)
  await expect
    .poll(() => worker.evaluate(() => (self as unknown as { reusing?: boolean }).reusing))
    .toBe(true)
  await sendCommand(page, 'disable')
  await worker.evaluate(() => (self as unknown as { releaseReuse?: () => void }).releaseReuse?.())
  expect((await sendCommand(page, 'status')).state.phase).toBe('idle')
  expect(
    await page.evaluate(async () => {
      const request = indexedDB.open('fufu-resources-v1', 1)
      const db = await new Promise<IDBDatabase>((resolve) => {
        request.onsuccess = () => resolve(request.result)
      })
      const count = db.transaction('blocks').objectStore('blocks').index('group').count('site')
      const value = await new Promise<number>((resolve) => {
        count.onsuccess = () => resolve(count.result)
      })
      db.close()
      return value
    }),
  ).toBe(0)
})

test('rejects a corrupt offline homepage without caching injected HTML or reporting a model failure', async ({
  context,
  page,
}) => {
  useBundles = false
  await context.route(`${pages}**`, async (route) => {
    const path = new URL(route.request().url()).pathname.slice(1)
    const data = documents(1).get(path)!
    const range = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers()['range'] ?? '')
    await route
      .fulfill({
        status: range ? 206 : 200,
        body: range ? data.subarray(Number(range[1]), Number(range[2]) + 1) : data,
        contentType: 'application/octet-stream',
        headers: { 'access-control-allow-origin': '*' },
      })
      .catch(() => {})
  })
  await page.goto(base)
  await registerWorker(page)
  corruptIndex = true
  await sendCommand(page, 'enable')
  await expect.poll(async () => (await resourceStatus(page)).phase).toBe('error')
  expect((await resourceStatus(page)).error).toBe('Resource checksum mismatch: index.html')
  expect((await resourceStatus(page)).modelError).toBe('')
  expect((await resourceStatus(page)).modelPhase).toBe('idle')
  expect((await resourceStatus(page)).modelsBytes).toBe(0)
  expect(indexDownloads).toBe(1)
  await page.addScriptTag({ content: cacheTools })
  const verification = await page.evaluate(
    async ({ resource, bytes }) => {
      const cache = (
        window as unknown as {
          resourceCache: {
            saveResourceBytes(
              resource: unknown,
              start: number,
              bytes: Uint8Array,
              epoch: number,
            ): Promise<void>
            resourceCoverage(resource: unknown): Promise<number[]>
          }
        }
      ).resourceCache
      const data = new Uint8Array(bytes)
      data[data.length - 1] ^= 1
      let error = ''
      try {
        await cache.saveResourceBytes(resource, 0, data, 0)
      } catch (failure) {
        error = (failure as Error).message
      }
      return { error, coverage: await cache.resourceCoverage(resource) }
    },
    {
      resource: manifests[0].resources.find((resource) => resource.group === 'model')!,
      bytes: [...weights.subarray(0, 256 * 1024)],
    },
  )
  expect(verification.error).toBe('Resource checksum mismatch: models/test/weights.part-000')
  expect(verification.coverage.every((count) => count === 0)).toBe(true)
  await context.setOffline(true)
  await page.goto(base)
  await expect(page.locator('body')).toHaveText('Offline resources are not ready.')
  await context.setOffline(false)
  corruptIndex = false
  await sendCommand(page, 'retry')
  await expect.poll(async () => (await resourceStatus(page)).phase).toBe('ready')
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('h1')).toHaveText('Offline 1')
  expect(
    await page.evaluate(() => (window as unknown as { proxyInjected?: boolean }).proxyInjected),
  ).toBeUndefined()
})

for (const tool of ['module', 'worker']) {
  for (const fault of ['http', 'network', 'truncated']) {
    test(`first ${tool} use recovers from a transient ${fault} resource failure`, async ({
      page,
    }) => {
      await page.goto(base)
      await registerWorker(page)
      await sendCommand(page, 'startup', false)
      toolFault = fault
      faultPath = tool === 'module' ? 'assets/lazy-1.js' : 'assets/cold-worker.js'
      const result = await page.evaluate(async (tool) => {
        if (tool === 'module') return (await import('/assets/lazy-1.js')).value
        return new Promise((resolve, reject) => {
          const worker = new Worker('/assets/cold-worker.js', { type: 'module' })
          worker.onmessage = ({ data }) => {
            worker.terminate()
            resolve(data)
          }
          worker.onerror = () => {
            worker.terminate()
            reject(new Error('First worker launch failed'))
          }
          worker.postMessage(41)
        })
      }, tool)
      expect(result).toBe(tool === 'module' ? 'tool 1' : 42)
      expect(toolAttempts).toBe(2)
      expect((await resourceStatus(page)).modelPhase).toBe('idle')
      expect((await resourceStatus(page)).phase).toBe('idle')
    })
  }
}

test('site timeouts reduce concurrency and status polling retains the backoff', async ({
  context,
  page,
}) => {
  await page.goto(base)
  await registerWorker(page)
  const files = Array.from({ length: 128 }, (_, index) => {
    const bytes = Buffer.from(`export const value=${index}`)
    return {
      path: `assets/retry-test-${index}.js`,
      bytes: bytes.length,
      hash: hash(bytes),
      blocks: [hash(bytes)],
      type: 'text/javascript',
      group: 'site',
      source: 'site',
      text: bytes.toString(),
    }
  })
  const resources = [
    manifests[0].resources[0],
    ...files.map(({ text: _text, ...resource }) => resource),
  ]
  await context.serviceWorkers()[0].evaluate(
    ({ resources, files, manifest }) => {
      Object.defineProperty(navigator, 'connection', {
        value: { effectiveType: '4g' },
        configurable: true,
      })
      const worker = self as unknown as {
        fetch: typeof fetch
        retryProbe: { started: number; active: number; maximum: number; release: (() => void)[] }
      }
      const original = worker.fetch.bind(self)
      worker.retryProbe = { started: 0, active: 0, maximum: 0, release: [] }
      worker.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.pathname === '/offline-manifest.json')
          return Response.json({ ...manifest, resources, bundles: undefined })
        const file = files.find((file) => '/' + file.path === url.pathname)
        if (!file) return original(input, init)
        const probe = worker.retryProbe
        if (++probe.started <= 64) {
          await new Promise<void>((resolve) => probe.release.push(resolve))
          throw Object.assign(new Error(`Resource download timed out: ${file.path}`), {
            name: 'TimeoutError',
          })
        }
        probe.active++
        probe.maximum = Math.max(probe.maximum, probe.active)
        try {
          await new Promise((resolve) => setTimeout(resolve, 30))
          return new Response(file.text, { headers: { 'content-type': 'text/javascript' } })
        } finally {
          probe.active--
        }
      }
    },
    { resources, files, manifest: manifests[0] },
  )
  await sendCommand(page, 'enable')
  await expect
    .poll(() =>
      context
        .serviceWorkers()[0]
        .evaluate(
          () => (self as unknown as { retryProbe: { started: number } }).retryProbe.started,
        ),
    )
    .toBe(64)
  await context.serviceWorkers()[0].evaluate(() => {
    for (const release of (self as unknown as { retryProbe: { release: (() => void)[] } })
      .retryProbe.release)
      release()
  })
  // The UI queries status with the chosen 64-thread preference during saving.
  // It must not restore the old limit after automatic timeout backoff.
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await sendCommand(page, 'status')
    if (result.state.phase === 'ready') break
    await page.waitForTimeout(15)
  }
  expect((await resourceStatus(page)).phase).toBe('ready')
  const maximum = await context
    .serviceWorkers()[0]
    .evaluate(() => (self as unknown as { retryProbe: { maximum: number } }).retryProbe.maximum)
  expect(maximum).toBe(4)
  expect((await resourceStatus(page)).modelPhase).toBe('idle')
})

for (const fallback of ['missing', 'unsupported', 'corrupt']) {
  test(`compressed site saving handles ${fallback} transport without downloading models`, async ({
    context,
    page,
  }) => {
    missingBundles = fallback === 'missing'
    corruptBundle = fallback === 'corrupt'
    await context.route(`${pages}**`, async (route) => {
      const path = new URL(route.request().url()).pathname.slice(1)
      if (missingBundles && path.startsWith('offline/bundle.')) {
        await route.fulfill({ status: 404 })
        return
      }
      const data = documents(1).get(path)!
      const range = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers()['range'] ?? '')
      await route
        .fulfill({
          status: range ? 206 : 200,
          body: range ? data.subarray(Number(range[1]), Number(range[2]) + 1) : data,
          contentType: 'application/octet-stream',
          headers: { 'access-control-allow-origin': '*' },
        })
        .catch(() => {})
    })
    await page.goto(base)
    await registerWorker(page)
    if (fallback === 'unsupported')
      await context.serviceWorkers()[0].evaluate(() => {
        Object.defineProperty(self, 'DecompressionStream', { value: undefined, configurable: true })
      })
    await sendCommand(page, 'enable')
    if (fallback === 'corrupt') {
      await expect.poll(async () => (await resourceStatus(page)).phase).toBe('error')
      expect((await resourceStatus(page)).error).toBe(
        'Offline bundle verification failed: index.html',
      )
      expect((await resourceStatus(page)).modelError).toBe('')
      corruptBundle = false
      await sendCommand(page, 'retry')
    }
    await expect.poll(async () => (await resourceStatus(page)).phase).toBe('ready')
    expect((await resourceStatus(page)).modelsBytes).toBe(0)
    expect((await resourceStatus(page)).modelPhase).toBe('idle')
    await context.setOffline(true)
    await page.goto(`${base}/settings`)
    await expect(page.locator('h1')).toHaveText('Offline 1')
    await page.getByRole('button', { name: 'Tool' }).click()
    await expect(page.locator('output')).toHaveText('tool 1')
    expect(
      await page.evaluate(() => (window as unknown as { proxyInjected?: boolean }).proxyInjected),
    ).toBeUndefined()
  })
}
