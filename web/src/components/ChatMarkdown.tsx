import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useLocale } from '../lib/i18n'

export function ChatMarkdown({ children }: { children: string }) {
  const { t } = useLocale()
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      urlTransform={defaultUrlTransform}
      components={{
        a: ({ href, children }) => (
          <a
            href={href}
            target={href?.startsWith('#') ? undefined : '_blank'}
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        img: ({ src, alt }) => (
          <a
            href={typeof src === 'string' ? src : undefined}
            target="_blank"
            rel="noopener noreferrer"
          >
            {alt || t('查看图片', 'View image')}
          </a>
        ),
        table: ({ children }) => (
          <div className="markdown-table">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {children}
    </Markdown>
  )
}
