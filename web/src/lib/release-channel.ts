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

type ReleaseChannel = 'stable' | 'beta'
export type ChannelRelease = { channel: ReleaseChannel; version: string }

export const installedRelease: ChannelRelease = {
  channel: isBetaChannel ? 'beta' : 'stable',
  version: releaseVersion,
}

export function compareReleases(a: ChannelRelease, b: ChannelRelease) {
  const parts = (release: ChannelRelease) => release.version.split(' ')[0].split('.').map(Number)
  const [aMajor, aMinor, aPatch] = parts(a)
  const [bMajor, bMinor, bPatch] = parts(b)
  return (
    aMajor - bMajor ||
    aMinor - bMinor ||
    aPatch - bPatch ||
    Number(a.channel === 'stable') - Number(b.channel === 'stable')
  )
}

export function releaseSettingsPath(channel: ReleaseChannel) {
  return `${channel === 'beta' ? BETA_PATH : '/'}settings`
}

async function currentRelease(
  channel: ReleaseChannel,
  signal: AbortSignal,
): Promise<ChannelRelease | null> {
  const response = await fetch(`${channel === 'beta' ? BETA_PATH : '/'}channel.json`, {
    cache: 'no-store',
    signal,
  })
  if (!response.ok) return null
  const data: { version?: unknown } = await response.json()
  const format = channel === 'beta' ? /^\d+\.\d+\.\d+ Beta$/ : /^\d+\.\d+\.\d+$/
  return typeof data.version === 'string' && format.test(data.version)
    ? { channel, version: data.version }
    : null
}

export async function latestRelease(joined: boolean, signal: AbortSignal) {
  const read = (channel: ReleaseChannel) => currentRelease(channel, signal).catch(() => null)
  const [stable, beta] = await Promise.all([read('stable'), joined ? read('beta') : null])
  return beta && (!stable || compareReleases(beta, stable) > 0) ? beta : stable
}
