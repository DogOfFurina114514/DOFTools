import { detectAICapability } from './ai'
// The router and the opening share these real imports and their browser module cache.
export const workspacePages = {
  dashboard: () => import('../pages/Dashboard'),
  settings: () => import('../pages/SettingsPage'),
  ai: () => import('../pages/AIPage'),
}

function nextFrame(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => {
      cancelAnimationFrame(frame)
      reject(signal.reason)
    }
    const frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    })
    signal.addEventListener('abort', abort, { once: true })
  })
}

async function prepareBrand(signal: AbortSignal) {
  if (document.documentElement.dataset.style === 'genshin') {
    await Promise.all(
      ['pyro', 'hydro', 'anemo', 'electro', 'dendro', 'cryo', 'geo'].map(async (element) => {
        const response = await fetch(`${import.meta.env.BASE_URL}assets/elements/${element}.png`, {
          signal,
        })
        if (!response.ok) throw new Error('元素图标加载失败。')
        const url = URL.createObjectURL(await response.blob())
        try {
          const image = new Image()
          image.src = url
          await image.decode()
        } finally {
          URL.revokeObjectURL(url)
        }
      }),
    )
  }
  const response = await fetch(
    new URL(`${import.meta.env.BASE_URL}favicon.svg`, document.baseURI),
    { signal },
  )
  if (!response.ok) throw new Error('工具箱标识加载失败。')
  const url = URL.createObjectURL(await response.blob())
  try {
    const image = new Image()
    image.src = url
    await image.decode()
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function prepareWorkspace(signal: AbortSignal, onProgress: (value: number) => void) {
  let completed = 0
  const tasks = [
    workspacePages.dashboard,
    workspacePages.settings,
    ...(detectAICapability().desktop ? [workspacePages.ai] : []),
    () => document.fonts.ready,
    () => prepareBrand(signal),
  ]
  const total = tasks.length + 1
  signal.throwIfAborted()
  onProgress(0)
  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      await task()
      signal.throwIfAborted()
      onProgress(++completed / total)
    }),
  )
  signal.throwIfAborted()
  for (const result of results) if (result.status === 'rejected') throw result.reason
  // Let the current route, loaded fonts and appearance commit before revealing it.
  await nextFrame(signal)
  await nextFrame(signal)
  signal.throwIfAborted()
  onProgress(1)
}
