import { cp, readFile, writeFile } from 'node:fs/promises'

const publicDir = new URL('../public/', import.meta.url)
const output = new URL('../../.site-build/beta-pages/', import.meta.url)
const base = '/DOFTools-Beta/'
const index = await readFile(new URL('index.html', output), 'utf8')
if (!index.includes(`${base}assets/`)) throw new Error('Not a Beta Pages build')

// Stable hosts the large model and runtime files. Copy only UI assets.
for (const entry of ['assets', 'fonts', 'licenses', 'sponsor', 'favicon.svg', '.nojekyll'])
  await cp(new URL(entry, publicDir), new URL(entry, output), { recursive: true })

const fallback = await readFile(new URL('404.html', publicDir), 'utf8')
await writeFile(
  new URL('404.html', output),
  fallback.replace(
    "'/?__route=' + encodeURIComponent(location.pathname + location.search + location.hash)",
    `'${base}?__route=' + encodeURIComponent('/' + location.pathname.slice(${base.length}) + location.search + location.hash)`,
  ),
)
