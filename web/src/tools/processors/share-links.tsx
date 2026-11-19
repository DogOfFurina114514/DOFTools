import { useEffect, useRef, useState } from 'react'
import { ToolUI } from '../../components/controls'
import { useLocale } from '../../lib/i18n'
import { bilingual as b, errorMessage, type DisplayText } from '../../lib/locale'
import type { ToolRunContext, ToolValues } from '../registry'
import { parseShareLinks, sharePlatforms, type ParsedShare } from './share-parser'
import {
  getShareDownload,
  loadShareFiles,
  MAX_SHARE_BYTES,
  type ShareListing,
} from './share-service'

function SharePreview({
  share,
  listing,
  initialError = '',
}: {
  share: ParsedShare
  listing?: ShareListing
  initialError?: DisplayText
}) {
  const { t, resolve } = useLocale()
  const [current, setCurrent] = useState(listing)
  const [path, setPath] = useState<{ id: string; name: string }[]>([])
  const [links, setLinks] = useState<Record<string, string>>({})
  const [error, setError] = useState<DisplayText>(initialError)
  const [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      controller.current?.abort()
      controller.current = null
    },
    [],
  )
  const request = async (action: 'list' | 'download', id: string, nextPath = path) => {
    if (controller.current) return
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setError('')
    try {
      const result =
        action === 'list'
          ? await loadShareFiles(share, abort.signal, id)
          : await getShareDownload(
              share,
              current!.files.find((file) => file.id === id)!,
              abort.signal,
            )
      if (abort.signal.aborted) return
      if (typeof result === 'string') setLinks((previous) => ({ ...previous, [id]: result }))
      else {
        setCurrent(result)
        setPath(nextPath)
        setLinks({})
      }
    } catch (error) {
      if (!abort.signal.aborted) setError(errorMessage(error))
    } finally {
      if (controller.current === abort) {
        controller.current = null
        setBusy(false)
      }
    }
  }
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      setError(
        b('无法写入剪贴板，请手动复制。', 'Cannot write to the clipboard. Copy the text manually.'),
      )
    }
  }
  return (
    <section className="share-preview">
      <h3>{resolve(sharePlatforms[share.platform])}</h3>
      <dl>
        <dt>{t('分享 ID', 'Share ID')}</dt>
        <dd>{share.shareId}</dd>
        <dt>{t('提取码', 'Access code')}</dt>
        <dd>{share.password || t('未提供', 'Not provided')}</dd>
        <dt>{t('分享链接', 'Share link')}</dt>
        <dd>
          <a href={share.url} target="_blank" rel="noopener noreferrer">
            {share.url}
          </a>
        </dd>
      </dl>
      <div className="ui-actions">
        <ToolUI.Button
          variant="secondary"
          onClick={() =>
            copy(
              share.url +
                (share.password ? `\n${t('提取码', 'Access code')}: ${share.password}` : ''),
            )
          }
        >
          {t('复制分享信息', 'Copy share info')}
        </ToolUI.Button>
        {!current && (
          <ToolUI.Button disabled={busy} onClick={() => request('list', '')}>
            {t('获取文件列表', 'Load file list')}
          </ToolUI.Button>
        )}
      </div>
      {current && (
        <>
          <h4>{t('分享文件', 'Shared files')}</h4>
          <div className="ui-actions">
            {path.length > 0 && (
              <ToolUI.Button
                variant="secondary"
                disabled={busy}
                onClick={() => request('list', path.at(-2)?.id ?? '', path.slice(0, -1))}
              >
                {t('返回上级', 'Back to parent')}
              </ToolUI.Button>
            )}
            <span>{path.map((part) => part.name).join(' / ') || t('根目录', 'Root folder')}</span>
          </div>
          {!current.files.length && <p>{t('文件夹为空。', 'This folder is empty.')}</p>}
          <ul className="share-files">
            {current.files.map((file) => (
              <li key={file.id}>
                <span>
                  {file.name}
                  {file.size !== undefined && !file.directory && (
                    <small>{(file.size / 1024 / 1024).toFixed(2)} MiB</small>
                  )}
                </span>
                {file.directory ? (
                  <ToolUI.Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      request('list', file.id, [...path, { id: file.id, name: file.name }])
                    }
                  >
                    {t('打开文件夹', 'Open folder')}
                  </ToolUI.Button>
                ) : file.size === undefined || file.size > MAX_SHARE_BYTES ? (
                  <span>{t('仅支持 ≤100 MiB 小文件', 'Only files ≤100 MiB are supported')}</span>
                ) : file.url || links[file.id] ? (
                  <div className="ui-actions">
                    <a href={links[file.id] || file.url} target="_blank" rel="noopener noreferrer">
                      {t('下载文件', 'Download file')}
                    </a>
                    <ToolUI.Button
                      variant="secondary"
                      onClick={() => copy(links[file.id] || file.url!)}
                    >
                      {t('复制直链', 'Copy download URL')}
                    </ToolUI.Button>
                    <ToolUI.Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => request('download', file.id)}
                    >
                      {t('重新获取直链', 'Refresh download URL')}
                    </ToolUI.Button>
                  </div>
                ) : (
                  <ToolUI.Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => request('download', file.id)}
                  >
                    {t('获取直链', 'Get download URL')}
                  </ToolUI.Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {busy && (
        <div className="ui-actions">
          <span>{t('正在请求解析服务…', 'Contacting the resolver…')}</span>
          <ToolUI.Button variant="secondary" onClick={() => controller.current?.abort()}>
            {t('取消', 'Cancel')}
          </ToolUI.Button>
        </div>
      )}
      {error && (
        <p className="error-message" role="alert">
          {resolve(error)}
        </p>
      )}
    </section>
  )
}

export async function resolveShareLinks(values: ToolValues, context: ToolRunContext) {
  const shares = parseShareLinks(String(values.text), String(values.password ?? ''))
  const listings: (ShareListing | undefined)[] = []
  const errors: DisplayText[] = []
  for (let i = 0; i < shares.length; i++) {
    context.signal.throwIfAborted()
    context.onStatus?.(
      b(
        `正在解析第 ${i + 1} / ${shares.length} 个分享…`,
        `Resolving share ${i + 1} / ${shares.length}…`,
      ),
    )
    try {
      listings[i] = await loadShareFiles(shares[i], context.signal)
    } catch (error) {
      context.signal.throwIfAborted()
      errors[i] = errorMessage(error)
    }
    context.onProgress((i + 1) / shares.length)
  }
  const loaded = listings.filter(Boolean).length
  return {
    summary: b(
      `已成功解析 ${loaded} / ${shares.length} 个分享。下载直链可能过期，可重新获取。`,
      `Resolved ${loaded} / ${shares.length} shares. Download URLs may expire; refresh them when needed.`,
    ),
    files: [
      {
        name: 'share-links.json',
        blob: new Blob(
          [
            JSON.stringify(
              {
                version: 1,
                shares: shares.map((share, i) => ({
                  ...share,
                  files: listings[i]?.files,
                  error: errors[i] || undefined,
                })),
              },
              null,
              2,
            ) + '\n',
          ],
          {
            type: 'application/json',
          },
        ),
      },
    ],
    preview: (
      <div className="share-results">
        {shares.map((share, i) => (
          <div key={share.url}>
            <SharePreview share={share} listing={listings[i]} initialError={errors[i]} />
          </div>
        ))}
      </div>
    ),
  }
}
