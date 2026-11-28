import { readFile, writeFile } from 'node:fs/promises'

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
if (!/^\d+\.\d+\.\d+-beta$/.test(version)) throw new Error('Expected a Beta package version')
await writeFile(
  new URL('../../.site-build/beta-build/build.json', import.meta.url),
  JSON.stringify({ version: version.replace(/-beta$/, ' Beta') }) + '\n',
)
