import { afterEach, expect, test } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { retainAssets } from '../scripts/retain-assets'

const folders: string[] = []
const testParent = fileURLToPath(new URL('../../.site-build/', import.meta.url))
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => {
      if (!resolve(folder).startsWith(resolve(testParent) + sep))
        throw new Error('Fixture leaves test directory')
      return rm(folder, { recursive: true, force: true })
    }),
  )
})

test('cached entries retain their dynamic processors across releases and repeated builds', async () => {
  await mkdir(testParent, { recursive: true })
  const root = await mkdtemp(join(testParent, 'fufu-asset-retention-'))
  folders.push(root)
  const output = join(root, 'site')
  await writeFile(join(root, 'index.html'), '<script type="module" src="/main.js"></script>')
  await writeFile(join(root, 'main.js'), 'window.loadProcessor = () => import("./processor.js")')
  const release = async (version: number) => {
    await writeFile(join(root, 'processor.js'), `export const version = ${version}`)
    await build({
      configFile: false,
      root,
      plugins: [retainAssets()],
      logLevel: 'silent',
      build: { outDir: output },
    })
    return JSON.parse(await readFile(join(output, 'asset-history.json'), 'utf8'))
      .builds as string[][]
  }
  const first = (await release(1))[0]
  const firstBytes = await Promise.all(first.map((name) => readFile(join(output, 'assets', name))))
  await release(2)
  const third = await release(3)
  expect(third).toHaveLength(3)
  expect(await Promise.all(first.map((name) => readFile(join(output, 'assets', name))))).toEqual(
    firstBytes,
  )
  expect(await release(3)).toEqual(third)
  const fourth = await release(4)
  expect(fourth).toHaveLength(4)
  expect(fourth[3]).toEqual(first)
  expect(await Promise.all(first.map((name) => readFile(join(output, 'assets', name))))).toEqual(
    firstBytes,
  )
  const fifth = await release(5)
  expect(fifth).toHaveLength(4)
  expect(fifth[3]).toEqual(third[1])
  const retained = await readdir(join(output, 'assets'))
  for (const name of first.filter((name) => !fifth.flat().includes(name)))
    expect(retained).not.toContain(name)
}, 30000)
