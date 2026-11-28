import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'

// Keep the previous three builds' hashed assets so open tabs and cached HTML can
// still import processors and their workers after a Pages deployment.
export function retainAssets(): Plugin {
  let output = ''
  let previous: string[][] = []
  const saved = new Map<string, Buffer>()
  const betaPages = new Map<string, Buffer>()
  let betaAssets: string[] = []
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
      previous = previous.filter((build) => build.length > 0)
      const beta = join(output, 'beta')
      try {
        const channel = await readFile(join(beta, 'channel.json'))
        const { assets } = JSON.parse(channel.toString('utf8'))
        if (!Array.isArray(assets)) throw new Error('Invalid Beta asset list')
        betaAssets = assets
        betaPages.set('index.html', await readFile(join(beta, 'index.html')))
        betaPages.set('channel.json', channel)
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
        if (betaAssets.length) throw new Error('Incomplete Beta deployment', { cause: error })
      }
      for (const name of new Set([...previous.slice(0, 4).flat(), ...betaAssets])) {
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
          ? [current, ...previous.slice(1, 4)]
          : [current, ...previous.slice(0, 3)]
      await mkdir(folder, { recursive: true })
      const emitted = new Set(current)
      for (const name of new Set([...builds.slice(1).flat(), ...betaAssets])) {
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
      if (betaPages.size) {
        const beta = join(output, 'beta')
        await mkdir(beta, { recursive: true })
        for (const [name, content] of betaPages) await writeFile(join(beta, name), content)
      }
    },
  }
}
