import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)),
    'test',
    'tests/model.spec.ts',
  ],
  {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: 'inherit',
    env: {
      ...process.env,
      FUFU_TEST_MODEL: '1',
      PLAYWRIGHT_CHANNEL:
        process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined),
    },
  },
)
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
