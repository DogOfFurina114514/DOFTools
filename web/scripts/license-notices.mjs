import { readdir, readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'))
const notices = [
  'Third-party dependency notices for DogOfFurina Toolbox.',
  'This inventory includes installed non-development JavaScript dependencies. Some are only used in Node.js and are not included in the browser build. See the repository THIRD_PARTY_LICENSES.md for scope.',
]
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path || pkg.dev || pkg.optional) continue
  const location = new URL(`${path}/`, root)
  const files = await readdir(location).catch(() => [])
  notices.push(
    `\n---\n${path.replace(/^node_modules\//, '')} ${pkg.version}\nLicense: ${pkg.license ?? 'See package'}\n`,
  )
  for (const file of files.filter((name) =>
    /^(license|licence|copying|notice|copyright)(\.|$)/i.test(name),
  )) {
    const contents = await readFile(new URL(file, location), 'utf8').catch(() => null)
    if (contents) notices.push(`${file}\n${contents}`)
  }
}
await writeFile(
  new URL('public/licenses/THIRD-PARTY.txt', root),
  notices.join('\n').replace(/\r\n/g, '\n') + '\n',
)
