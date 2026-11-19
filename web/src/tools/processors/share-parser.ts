import { bilingual as b, LocalizedError } from '../../lib/locale'

export const sharePlatforms = {
  lanzou: b('蓝奏云', 'Lanzou Cloud'),
  ilanzou: b('蓝奏云优享版', 'Lanzou Premium'),
}
export type ParsedShare = {
  platform: keyof typeof sharePlatforms
  shareId: string
  password: string
  url: string
}

// Public URL formats, independently implemented; YunX is a behavioral reference.
function recognize(url: URL): Pick<ParsedShare, 'platform' | 'shareId'> | undefined {
  const host = url.hostname.toLowerCase(),
    path = url.pathname.replace(/\/+$/, '')
  if (/^(?:[a-z0-9-]+\.)*ilanzou\.com$/.test(host)) {
    const shareId = /^\/s\/([a-z0-9]+)$/i.exec(path)?.[1]
    if (shareId) return { platform: 'ilanzou', shareId }
  }
  if (/^(?:[a-z0-9-]+\.)*(?:lanzou[a-z]?|lanzo[ux]|lanzn)\.com$/.test(host)) {
    const shareId = /^\/([a-z0-9]+)$/i.exec(path)?.[1]
    if (shareId) return { platform: 'lanzou', shareId }
  }
}

export function parseShareLinks(text: string, override = ''): ParsedShare[] {
  if (!text.trim() || text.length > 20000)
    throw new LocalizedError(
      '请粘贴分享链接，文案最多 20000 字符。',
      'Paste a share link. Share text is limited to 20,000 characters.',
    )
  const password = override.trim()
  if (password && !/^[a-z0-9]{1,16}$/i.test(password))
    throw new LocalizedError(
      '提取码只能包含 1–16 位字母或数字。',
      'Access codes must contain 1–16 letters or digits.',
    )
  const matches = [...text.matchAll(/https?:\/\/[^\s<>"'，。；（）【】]+/gi)]
  const shares: ParsedShare[] = []
  for (let i = 0; i < matches.length; i++) {
    let url: URL
    try {
      url = new URL(matches[i][0].replace(/[.,;)}\]：:]+$/, ''))
    } catch {
      continue
    }
    if (url.username || url.password || url.port) continue
    const recognized = recognize(url)
    if (!recognized) continue
    const after = text.slice(
      matches[i].index! + matches[i][0].length,
      matches[i + 1]?.index ?? text.length,
    )
    const before =
      text
        .slice(i ? matches[i - 1].index! + matches[i - 1][0].length : 0, matches[i].index)
        .split(/\r?\n/)
        .at(-1) ?? ''
    const codeInText =
      /(?:提取码|访问码|密码|access\s*code|password|code)\s*[:：=]?\s*([a-z0-9]{1,16})(?![a-z0-9])/i
    let code = password
    for (const key of ['pwd', 'password', 'passcode', 'pass', 'code']) {
      const candidate = url.searchParams.get(key)
      if (!code && candidate && /^[a-z0-9]{1,16}$/i.test(candidate)) code = candidate
    }
    if (!code) code = codeInText.exec(after)?.[1] ?? codeInText.exec(before)?.[1] ?? ''
    const canonical = new URL(url.href)
    canonical.protocol = 'https:'
    canonical.search = ''
    canonical.hash = ''
    if (code) canonical.searchParams.set(recognized.platform === 'ilanzou' ? 'code' : 'pwd', code)
    const share = { ...recognized, password: code, url: canonical.href }
    if (!shares.some((item) => item.url === share.url)) shares.push(share)
    if (shares.length > 20)
      throw new LocalizedError(
        '一次最多解析 20 个分享链接。',
        'At most 20 share links can be parsed at once.',
      )
  }
  if (!shares.length)
    throw new LocalizedError(
      '没有识别到支持的分享链接。目前仅支持蓝奏云和蓝奏云优享版的免登录小文件分享。',
      'No supported share links were found. Only anonymous small-file shares from Lanzou Cloud and Lanzou Premium are supported.',
    )
  return shares
}
