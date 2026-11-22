import { useState } from 'react'
import { ToolUI } from '../../components/controls'
import { formatBytes } from '../../lib/browser-tools'
import { useLocale } from '../../lib/i18n'
import { bilingual as b, errorMessage, type DisplayText } from '../../lib/locale'
import type { ToolRunContext, ToolValues } from '../registry'
import { parseSocialLinks, socialPlatforms, type SocialLink } from './social-parser'
import {
  socialResolver,
  validateSocialResolution,
  type SocialMedia,
  type SocialResolution,
  type SocialResolver,
} from './social-service'

function mediaDetails(item: SocialMedia) {
  return [
    item.width && item.height ? `${item.width} × ${item.height}` : '',
    item.format?.toUpperCase(),
    item.codec,
    item.size != null ? formatBytes(item.size) : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function SocialMediaPicker({ items, kind }: { items: SocialMedia[]; kind: SocialMedia['kind'] }) {
  const { t, resolve } = useLocale()
  const [value, setValue] = useState('0')
  const [message, setMessage] = useState<DisplayText>('')
  const selected = items[Number(value)] ?? items[0]
  const label =
    kind === 'video'
      ? t('画质', 'Video quality')
      : kind === 'audio'
        ? t('音轨', 'Audio track')
        : t('图片', 'Image')
  const name =
    kind === 'video'
      ? t('视频', 'Video')
      : kind === 'audio'
        ? t('音轨', 'Audio')
        : t('图片', 'Image')
  return (
    <div className="social-media-picker" data-kind={kind}>
      <ToolUI.Select
        label={label}
        value={value}
        onValueChange={(next) => {
          setValue(next)
          setMessage('')
        }}
        options={items.map((item, index) => ({
          value: String(index),
          label: [item.label || `${name} ${index + 1}`, mediaDetails(item)]
            .filter(Boolean)
            .join(' · '),
        }))}
      />
      <div className="ui-actions">
        <a
          className="social-media-open"
          href={selected.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t(`打开 / 保存${name}`, `Open / save ${name.toLowerCase()}`)}
        </a>
        <ToolUI.Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(selected.url)
              setMessage(b('链接已复制。', 'Link copied.'))
            } catch {
              setMessage(
                b(
                  '无法写入剪贴板，请手动复制下方链接。',
                  'Cannot write to the clipboard. Copy the URL below manually.',
                ),
              )
            }
          }}
        >
          {t('复制所选链接', 'Copy selected URL')}
        </ToolUI.Button>
      </div>
      <p className="social-selected-url">{selected.url}</p>
      {message && <p role="status">{resolve(message)}</p>}
    </div>
  )
}

function SocialPreview({
  links,
  media,
  errors,
}: {
  links: SocialLink[]
  media: (SocialResolution | undefined)[]
  errors: DisplayText[]
}) {
  const { t, resolve } = useLocale()
  return (
    <div className="share-results">
      <p role="note">
        {t(
          '可选择接口提供的画质、音轨或图片。部分画质仅含视频，需与独立音轨合并；打开媒体后可按浏览器提示保存。链接可能过期，无法打开时请重新解析。',
          'Choose the quality, audio track or image supplied by the resolver. Some video variants need a separate audio track. Open the media to save it in your browser. URLs may expire; resolve again if needed.',
        )}
      </p>
      {links.map((link, i) => (
        <section className="share-preview" key={link.url}>
          <h3>{resolve(socialPlatforms[link.platform])}</h3>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.url}
          </a>
          {media[i]?.title && <p>{media[i].title}</p>}
          {(['video', 'audio', 'image'] as const).map((kind) => {
            const items = media[i]?.media.filter((item) => item.kind === kind) ?? []
            return items.length ? <SocialMediaPicker key={kind} items={items} kind={kind} /> : null
          })}
          {errors[i] && (
            <p className="error-message" role="alert">
              {resolve(errors[i])}
            </p>
          )}
        </section>
      ))}
    </div>
  )
}

async function pauseBetweenRequests(signal: AbortSignal) {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, 1500)
    signal.addEventListener('abort', abort, { once: true })
  })
  signal.throwIfAborted()
}

export async function resolveSocialLinks(
  values: ToolValues,
  context: ToolRunContext,
  resolver: SocialResolver = socialResolver,
) {
  const links = parseSocialLinks(String(values.text ?? ''))
  const media: (SocialResolution | undefined)[] = []
  const errors: DisplayText[] = []
  let firstError: unknown
  for (const [i, link] of links.entries()) {
    context.signal.throwIfAborted()
    // The public provider can rate-limit anonymous calls. Pace batches without
    // retrying failures automatically or hiding the service's actual error.
    if (i > 0) {
      context.onStatus?.(b('等待下一次请求，避免连续调用过快…', 'Waiting before the next request…'))
      await pauseBetweenRequests(context.signal)
    }
    context.onStatus?.(
      b(
        `正在解析第 ${i + 1} / ${links.length} 个链接…`,
        `Resolving link ${i + 1} / ${links.length}…`,
      ),
    )
    try {
      media[i] = validateSocialResolution(await resolver(link, context))
      context.signal.throwIfAborted()
    } catch (error) {
      context.signal.throwIfAborted()
      firstError ??= error
      errors[i] = errorMessage(error)
    }
    context.onProgress((i + 1) / links.length)
  }
  const loaded = media.filter(Boolean).length
  if (!loaded) throw firstError
  return {
    summary: b(
      `已解析 ${loaded} / ${links.length} 个链接${loaded < links.length ? `，${links.length - loaded} 个失败` : ''}。可选择画质等媒体选项。媒体链接可能过期，请及时使用。`,
      `Resolved ${loaded} / ${links.length} links${loaded < links.length ? `; ${links.length - loaded} failed` : ''}. Choose from the available media options. URLs may expire; use them promptly.`,
    ),
    preview: <SocialPreview links={links} media={media} errors={errors} />,
  }
}
