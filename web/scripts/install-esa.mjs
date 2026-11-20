import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run the ESA build with npm run build:esa')

// Install the locked browser and build dependencies even when ESA skips its
// root-package detection or sets NODE_ENV=production. Browser WASM is bundled
// separately; optional native GPU binaries are unnecessary on the build host.
const install = spawn(
  process.execPath,
  [npmCli, 'ci', '--include=dev', '--prefer-offline', '--no-audit', '--no-fund'],
  {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: 'inherit',
    env: { ...process.env, ONNXRUNTIME_NODE_INSTALL: 'skip' },
  },
)
install.on('error', (error) => {
  console.error(`ESA dependency installation failed: ${error.message}`)
  process.exitCode = 1
})
install.on('exit', (code) => {
  process.exitCode = code ?? 1
})
