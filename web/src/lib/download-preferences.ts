import { readStorage, writeStorage } from './storage'

export const DOWNLOAD_THREADS = [32, 64, 128] as const
export type DownloadThreads = (typeof DOWNLOAD_THREADS)[number]
export const isDownloadThreads = (value: unknown): value is DownloadThreads =>
  DOWNLOAD_THREADS.some((threads) => value === threads)
export function modelDownloadThreads() {
  return readStorage<DownloadThreads>('model-download-threads', 64, isDownloadThreads)
}
export function saveDownloadThreads(threads: DownloadThreads) {
  writeStorage('model-download-threads', threads)
}
