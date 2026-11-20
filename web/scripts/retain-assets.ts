import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'

// Keep the previous two builds' hashed assets so open tabs and cached HTML can
// still import processors and their workers after a Pages deployment.
export function retainAssets(): Plugin {
  let output = ''
  let previous: string[][] = []
  const saved = new Map<string, Buffer>()
  return {
    name: 'retain-previous-assets',
    apply: 'build',
    configResolved(config) {
      output = resolve(config.root, config.build.outDir)
    },
    async buildStart() {
      const folder = join(output, 'assets')
      try {
        previous = JSON.parse(await readFile(join(output, 'asset-history.json'), 'utf8')).builds
        if (!Array.isArray(previous) || !previous.every(Array.isArray))
          throw new Error('Invalid asset history')
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
        const entries = await readdir(folder, { withFileTypes: true }).catch((error) => {
          if (error.code === 'ENOENT') return []
          throw error
        })
        previous = [
          entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .sort(),
        ]
      }
      for (const name of new Set(previous.slice(0, 3).flat())) {
        if (typeof name !== 'string' || !/^[\w.-]+$/.test(name) || name.startsWith('.'))
          throw new Error('Invalid retained asset path')
        saved.set(name, await readFile(join(folder, name)))
      }
    },
    async writeBundle() {
      const folder = join(output, 'assets')
      const entries = await readdir(folder, { withFileTypes: true })
      const current = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort()
      const builds =
        JSON.stringify(current) === JSON.stringify(previous[0])
          ? [current, ...previous.slice(1, 3)]
          : [current, ...previous.slice(0, 2)]
      await mkdir(folder, { recursive: true })
      const emitted = new Set(current)
      for (const name of new Set(builds.slice(1).flat())) {
        if (!emitted.has(name)) {
          const bytes = saved.get(name)
          if (!bytes) throw new Error(`Missing retained asset: ${name}`)
          await writeFile(join(folder, name), bytes)
        }
      }
      await writeFile(
        join(output, 'asset-history.json'),
        JSON.stringify({ version: 1, builds }, null, 2) + '\n',
      )
    },
  }
}
