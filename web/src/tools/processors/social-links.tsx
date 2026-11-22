import { useLocale } from '../../lib/i18n'
import { bilingual as b, LocalizedError } from '../../lib/locale'
import type { ToolRunContext, ToolValues } from '../registry'
import { parseSocialLinks, socialPlatforms, type SocialLink } from './social-parser'
import { socialResolver, type SocialResolution, type SocialResolver } from './social-service'
import { httpUrl } from './share-service'

function SocialPreview({ links, media }: { links: SocialLink[]; media: SocialResolution[] }) {
  const { t, resolve } = useLocale()
  return (
    <div className="share-results">
      {!media.length && (
        <p className="social-pending" role="note">
          {t(
            '解析接口待接入。目前仅识别平台和链接，暂不能获取媒体直链。',
            'Resolver API pending. Platform and link identification is available; media URLs are not available yet.',
          )}
        </p>
      )}
      {links.map((link, i) => (
        <section className="share-preview" key={link.url}>
          <h3>{resolve(socialPlatforms[link.platform])}</h3>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.url}
          </a>
          {media[i]?.title && <p>{media[i].title}</p>}
          {media[i]?.media.map((item, index) => (
            <p key={index}>
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.label || t('打开媒体链接', 'Open media URL')}
              </a>
            </p>
          ))}
        </section>
      ))}
    </div>
  )
}

export async function resolveSocialLinks(
  values: ToolValues,
  context: ToolRunContext,
  resolver: SocialResolver | undefined = socialResolver,
) {
  const links = parseSocialLinks(String(values.text ?? ''))
  const media: SocialResolution[] = []
  for (const link of links) {
    context.signal.throwIfAborted()
    if (resolver) {
      const result = await resolver(link, context)
      context.signal.throwIfAborted()
      if (
        !result ||
        !Array.isArray(result.media) ||
        !result.media.length ||
        result.media.length > 100 ||
        (result.title != null && typeof result.title !== 'string') ||
        result.media.some(
          (item) =>
            !item ||
            !['video', 'audio', 'image'].includes(item.kind) ||
            typeof item.url !== 'string' ||
            !httpUrl(item.url) ||
            (item.label != null && typeof item.label !== 'string'),
        )
      )
        throw new LocalizedError(
          '解析接口返回了无效媒体信息。',
          'The resolver returned invalid media data.',
        )
      media.push(result)
    }
    context.onProgress((links.indexOf(link) + 1) / links.length)
  }
  return {
    summary: resolver
      ? b(
          `已解析 ${links.length} 个链接。媒体链接可能过期，请及时使用。`,
          `Resolved ${links.length} links. Media URLs may expire; use them promptly.`,
        )
      : b(
          `已识别 ${links.length} 个链接。解析接口待接入，暂不能获取媒体直链。`,
          `Identified ${links.length} links. Resolver API pending; media URLs are not available yet.`,
        ),
    preview: <SocialPreview links={links} media={media} />,
  }
}
