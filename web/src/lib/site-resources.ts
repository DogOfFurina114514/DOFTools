// github.io redirects to this HTTPS CNAME. Both addresses serve GitHub Pages
// through its CDN; use HTTPS directly to avoid the redirect through HTTP.
export const PAGES_RESOURCE_BASE = 'https://toolbox.owo.lat/'
export const BETA_PATH = '/beta/'

export function resourceBase(siteBase: string, development = import.meta.env.DEV): string {
  return development ? new URL(siteBase).href : PAGES_RESOURCE_BASE
}
