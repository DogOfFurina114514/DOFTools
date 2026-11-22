import { resourceBase } from '../../lib/site-resources'

export interface FFmpegCore {
  FS: {
    writeFile: (path: string, data: Uint8Array) => void
    readFile: (path: string) => Uint8Array
    unlink: (path: string) => void
  }
  exec: (...args: string[]) => number
  reset: () => void
  setTimeout: (milliseconds: number) => void
  setProgress: (callback: (event: { time: number }) => void) => void
  setLogger: (callback: (event: { message: string }) => void) => void
}

// Each cancellable Worker owns its single-thread core and virtual filesystem.
// The upstream runtime requires neither a server nor cross-origin isolation.
let corePromise: Promise<FFmpegCore> | undefined
export async function getFFmpegCore() {
  if (!corePromise) {
    const siteBase = new URL(import.meta.env.BASE_URL, self.location.href).href
    const base = new URL('runtime/ffmpeg/', resourceBase(siteBase))
    const script = new URL('ffmpeg-core.js', base).href
    corePromise = import(/* @vite-ignore */ script)
      .then(({ default: createCore }) =>
        createCore({
          mainScriptUrlOrBlob: `${script}#${btoa(JSON.stringify({ wasmURL: new URL('ffmpeg-core.wasm', base).href }))}`,
        }),
      )
      .catch((error) => {
        corePromise = undefined
        throw error
      })
  }
  return corePromise
}
