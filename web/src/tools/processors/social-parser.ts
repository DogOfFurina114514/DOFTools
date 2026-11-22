import { bilingual as b, LocalizedError } from '../../lib/locale'

export const socialPlatforms = {
  bilibili: b('哔哩哔哩', 'Bilibili'),
  douyin: b('抖音', 'Douyin'),
  kuaishou: b('快手', 'Kuaishou'),
  x: b('X', 'X'),
  youtube: b('YouTube', 'YouTube'),
  tiktok: b('TikTok', 'TikTok'),
  wechat: b('视频号', 'WeChat Channels'),
  xiaohongshu: b('小红书', 'Xiaohongshu / RED'),
  instagram: b('Instagram', 'Instagram'),
  ixigua: b('西瓜视频', 'Xigua Video'),
  haokan: b('好看视频', 'Haokan Video'),
  weishi: b('微视', 'Weishi'),
  pearvideo: b('梨视频', 'Pear Video'),
  acfun: b('AcFun', 'AcFun'),
  zhihu: b('知乎', 'Zhihu'),
  oasis: b('绿洲', 'Oasis'),
  meipai: b('美拍', 'Meipai'),
  quanmin: b('全民小视频', 'Quanmin Video'),
  huya: b('虎牙', 'Huya'),
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
  if (
    (host === 'weixin.qq.com' && /^\/sph\/[a-zA-Z0-9_-]+\/?$/.test(path)) ||
    (host === 'channels.weixin.qq.com' &&
      (/^\/web\/pages\/(?:feed|share)\/?$/.test(path) ||
        /^\/platform\/post\/[a-zA-Z0-9_-]+\/?$/.test(path))) ||
    (host === 'finder.video.qq.com' && path !== '/')
  )
    return 'wechat'
  if (
    (['xiaohongshu.com', 'www.xiaohongshu.com'].includes(host) &&
      /^\/(?:explore|discovery\/item)\/[a-zA-Z0-9]+\/?$/.test(path)) ||
    (['xhslink.com', 'www.xhslink.com'].includes(host) &&
      /^\/(?:(?:a|o)\/)?[a-zA-Z0-9]+\/?$/.test(path))
  )
    return 'xiaohongshu'
  if (
    ['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(host) &&
    /^\/(?:p|reel|reels|tv)\/[a-zA-Z0-9_-]+\/?$/.test(path)
  )
    return 'instagram'
  if (
    (['ixigua.com', 'www.ixigua.com', 'm.ixigua.com'].includes(host) && /^\/\d+\/?$/.test(path)) ||
    (host === 'v.ixigua.com' && /^\/[a-zA-Z0-9_-]+\/?$/.test(path))
  )
    return 'ixigua'
  if (
    (['haokan.baidu.com', 'haokan.hao123.com'].includes(host) &&
      ['/v', '/v/', '/share'].includes(path) &&
      /^\d+$/.test(url.searchParams.get('vid') ?? '')) ||
    (host === 'haokan.baidu.com' && /^\/v\/[a-zA-Z0-9_-]+\/?$/.test(path))
  )
    return 'haokan'
  if (
    (host === 'h5.weishi.qq.com' &&
      /^\/weishi\/(?:feed|tvp\/d)\//.test(path) &&
      !!url.searchParams.get('id')) ||
    (host === 'isee.weishi.qq.com' && path !== '/')
  )
    return 'weishi'
  if (
    ['pearvideo.com', 'www.pearvideo.com', 'm.pearvideo.com'].includes(host) &&
    (/^\/video_\d+\/?$/.test(path) ||
      (path === '/detail' && /^\d+$/.test(url.searchParams.get('v') ?? '')))
  )
    return 'pearvideo'
  if (['acfun.cn', 'www.acfun.cn', 'm.acfun.cn'].includes(host) && /^\/v\/ac\d+\/?$/.test(path))
    return 'acfun'
  if (
    ['zhihu.com', 'www.zhihu.com', 'zhuanlan.zhihu.com'].includes(host) &&
    /^\/(?:zvideo\/\d+|question\/\d+\/answer\/\d+|p\/\d+)\/?$/.test(path)
  )
    return 'zhihu'
  if (
    ['oasis.weibo.cn', 'm.oasis.weibo.cn'].includes(host) &&
    /^\/v1\/h5\/share(?:\/index)?\/?$/.test(path) &&
    !!url.searchParams.get('sid')
  )
    return 'oasis'
  if (
    ['meipai.com', 'www.meipai.com', 'm.meipai.com'].includes(host) &&
    /^\/(?:media|video)\/\d+\/?$/.test(path)
  )
    return 'meipai'
  if (
    ['quanmin.baidu.com', 'quanmin.hao123.com'].includes(host) &&
    /^\/sv\/?$/.test(path) &&
    !!url.searchParams.get('source')
  )
    return 'quanmin'
  if (
    host === 'v.huya.com' &&
    (/^\/play\/\d+\.html$/.test(path) ||
      (path === '/play' && /^\d+$/.test(url.searchParams.get('vid') ?? '')))
  )
    return 'huya'
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
        '请使用支持平台的视频、帖子或分享短链接；支持视频号、小红书、抖音、哔哩哔哩、快手、X、YouTube、TikTok、Instagram 等平台。',
        'Use a supported video, post or short share link, such as WeChat Channels, Xiaohongshu, Douyin, Bilibili, Kuaishou, X, YouTube, TikTok or Instagram.',
      )
    url.protocol = 'https:'
    url.hash = ''
    if (platform === 'x') url.hostname = 'x.com'
    const value = { platform, url: url.href }
    if (!results.some((item) => item.url === value.url)) results.push(value)
    if (results.length > 20)
      throw new LocalizedError('每次最多解析 20 个链接。', 'Resolve up to 20 links at a time.')
  }
  return results
}
