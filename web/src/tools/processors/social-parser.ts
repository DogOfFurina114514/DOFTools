import { bilingual as b, LocalizedError } from '../../lib/locale'

export const socialPlatforms = {
  bilibili: b('哔哩哔哩', 'Bilibili'),
  douyin: b('抖音', 'Douyin'),
  kuaishou: b('快手', 'Kuaishou'),
  x: b('X', 'X'),
  youtube: b('YouTube', 'YouTube'),
  tiktok: b('TikTok', 'TikTok'),
} as const
export type SocialPlatform = keyof typeof socialPlatforms
export interface SocialLink {
  platform: SocialPlatform
  url: string
}

function platformFor(url: URL): SocialPlatform | undefined {
  const host = url.hostname.toLowerCase()
  const path = url.pathname
  if (
    (['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(host) &&
      /^\/video\/(BV[a-zA-Z0-9]+|av\d+)(?:\/|$)/.test(path)) ||
    (host === 'b23.tv' && /^\/[a-zA-Z0-9]+\/?$/.test(path))
  )
    return 'bilibili'
  if (
    (['www.douyin.com', 'douyin.com', 'iesdouyin.com', 'www.iesdouyin.com'].includes(host) &&
      /^\/(?:video|note|share\/video)\/\d+\/?$/.test(path)) ||
    (host === 'v.douyin.com' && /^\/[a-zA-Z0-9_-]+\/?$/.test(path))
  )
    return 'douyin'
  if (
    (['www.kuaishou.com', 'kuaishou.com', 'v.kuaishou.com', 'www.gifshow.com'].includes(host) &&
      /^\/(?:short-video\/)?[a-zA-Z0-9_-]+\/?$/.test(path)) ||
    (host === 'www.kuaishou.com' && path === '/fw/photo' && !!url.searchParams.get('photoId'))
  )
    return 'kuaishou'
  if (
    ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(host) &&
    /^\/(?:[a-zA-Z0-9_]+\/status|i\/web\/status)\/\d+\/?$/.test(path)
  )
    return 'x'
  if (
    (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host) &&
      ((path === '/watch' && /^[a-zA-Z0-9_-]{11}$/.test(url.searchParams.get('v') ?? '')) ||
        /^\/(?:shorts|embed|live)\/[a-zA-Z0-9_-]{11}\/?$/.test(path))) ||
    (host === 'youtu.be' && /^\/[a-zA-Z0-9_-]{11}\/?$/.test(path))
  )
    return 'youtube'
  if (
    (['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(host) &&
      /^\/@[a-zA-Z0-9._-]+\/(?:video|photo)\/\d+\/?$/.test(path)) ||
    (['vm.tiktok.com', 'vt.tiktok.com'].includes(host) && /^\/[a-zA-Z0-9]+\/?$/.test(path)) ||
    (['tiktok.com', 'www.tiktok.com'].includes(host) && /^\/t\/[a-zA-Z0-9]+\/?$/.test(path))
  )
    return 'tiktok'
}

export function parseSocialLinks(text: string): SocialLink[] {
  if (text.length > 20000)
    throw new LocalizedError(
      '分享文案最多 20000 个字符。',
      'Share text is limited to 20,000 characters.',
    )
  const urls = text.match(/https?:\/\/[^\s<>"'，。；、！）)\]】]+/gi) ?? []
  if (!urls.length)
    throw new LocalizedError(
      '请粘贴支持平台的视频或帖子链接。',
      'Paste a video or post link from a supported platform.',
    )
  const results: SocialLink[] = []
  for (const raw of urls) {
    let url: URL
    try {
      url = new URL(raw.replace(/[.,;!?]+$/, ''))
    } catch {
      throw new LocalizedError('链接格式无效。', 'Invalid link format.')
    }
    if (url.username || url.password || url.port)
      throw new LocalizedError(
        '链接不能包含账号信息或自定义端口。',
        'Links cannot contain credentials or custom ports.',
      )
    const platform = platformFor(url)
    if (!platform)
      throw new LocalizedError(
        '只支持哔哩哔哩、抖音、快手、X、YouTube、TikTok 的视频、帖子或分享短链接。',
        'Only Bilibili, Douyin, Kuaishou, X, YouTube and TikTok video, post or short share links are supported.',
      )
    url.protocol = 'https:'
    url.hash = ''
    if (platform === 'x') url.hostname = 'x.com'
    const value = { platform, url: url.href }
    if (!results.some((item) => item.url === value.url)) results.push(value)
    if (results.length > 20)
      throw new LocalizedError('每次最多识别 20 个链接。', 'Identify up to 20 links at a time.')
  }
  return results
}
