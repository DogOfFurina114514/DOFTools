import { version } from '../../package.json'
import { BETA_PATH } from './site-resources'
import { readStorage, writeStorage } from './storage'

export const isBetaChannel = import.meta.env.MODE === 'beta'
export const releaseVersion = version.replace(/-beta$/, ' Beta')
export const appBase = isBetaChannel ? BETA_PATH : import.meta.env.BASE_URL

const preference = 'beta-opted-in'
export const hasJoinedBeta = () => readStorage<boolean>(preference, false) === true
export const joinBeta = () => writeStorage(preference, true)
export const optOutOfBeta = () => writeStorage(preference, false)

export function leaveBeta() {
  optOutOfBeta()
  window.location.replace('/settings')
}

export async function currentRelease(
  channel: 'stable' | 'beta',
  signal: AbortSignal,
): Promise<string | null> {
  const response = await fetch(`${channel === 'beta' ? BETA_PATH : '/'}channel.json`, {
    cache: 'no-store',
    signal,
  })
  if (!response.ok) return null
  const data: { version?: unknown } = await response.json()
  const format = channel === 'beta' ? /^\d+\.\d+\.\d+ Beta$/ : /^\d+\.\d+\.\d+$/
  return typeof data.version === 'string' && format.test(data.version) ? data.version : null
}
