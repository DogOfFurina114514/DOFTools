import { Component, type ReactNode } from 'react'
import { useLocale } from '../lib/i18n'
import { BookSpread } from './BookSpread'

function LoadError() {
  const { t } = useLocale()
  return (
    <BookSpread left={<div className="page-loading page-loading-error" role="alert">
      <h2>{t('页面资源暂时未能加载', 'Page resources could not load')}</h2>
      <p>{t('重新加载后，可以继续使用工具箱。', 'Reload to continue using the toolbox.')}</p>
    </div>} right={<button className="button" onClick={() => window.location.reload()}>
        {t('重新加载', 'Reload')}
      </button>} />
  )
}

export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) return <LoadError />
    return this.props.children
  }
}
