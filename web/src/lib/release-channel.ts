import { version } from '../../package.json'
import { PAGES_RESOURCE_BASE } from './site-resources'
import { readStorage, writeStorage } from './storage'

export const isBetaChannel = import.meta.env.MODE === 'beta'
export const releaseVersion = version.replace(/-beta$/, ' Beta')
export const stableSite = PAGES_RESOURCE_BASE
export const betaSite = 'https://dogoffurina114514.github.io/DOFTools-Beta/'

const betaPreference = 'beta-opted-in'
export const hasJoinedBeta = () => readStorage<boolean>(betaPreference, false) === true
export const joinBeta = () => writeStorage(betaPreference, true)

export function leaveBeta() {
  writeStorage(betaPreference, false)
  window.location.replace(stableSite)
}
