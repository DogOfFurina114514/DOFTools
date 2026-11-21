import { ArrowUpRight, Star } from 'lucide-react'
import { useLocale } from '../lib/i18n'
import { Button, Dialog } from './controls'

export const SPONSOR_PAYMENTS = [
  { id: 'alipay', name: '支付宝', english: 'Alipay', path: 'sponsor/alipay.png' },
  { id: 'wechat', name: '微信', english: 'WeChat', path: 'sponsor/wechat.png' },
] as const
export const PROJECT_REPOSITORY = 'https://github.com/DogOfFurina114514/DOFTools'

export function SponsorDialog({
  automatic,
  onClose,
  onDismissReminders,
}: {
  automatic: boolean
  onClose: () => void
  onDismissReminders: () => void
}) {
  const { t } = useLocale()
  return (
    <Dialog
      open
      className="sponsor-dialog"
      title={t('赞助 · 支持开发', 'Sponsor · Support development')}
      onClose={onClose}
      actions={
        <>
          <a
            className="button secondary sponsor-star"
            href={PROJECT_REPOSITORY}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Star size={16} aria-hidden="true" />
            {t('点个 Star', 'Star on GitHub')}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <div className="sponsor-dismiss">
            {automatic && (
              <Button onClick={onDismissReminders}>{t('不再提示', 'Don’t remind me again')}</Button>
            )}
            <Button variant={automatic ? 'secondary' : 'primary'} onClick={onClose}>
              {t('关闭', 'Close')}
            </Button>
          </div>
        </>
      }
    >
      <p className="sponsor-intro">
        {automatic && t('工具已成功运行。', 'Your tool finished successfully. ')}
        {t(
          '如果工具箱帮到了你，欢迎自愿赞助，支持后续开发与维护。感谢你的支持！',
          'If the toolbox helped you, a voluntary donation supports its development and maintenance. Thank you!',
        )}
      </p>
      <div className="sponsor-payments">
        {SPONSOR_PAYMENTS.map((payment) => {
          const name = t(payment.name, payment.english)
          const url = `${import.meta.env.BASE_URL}${payment.path}`
          return (
            <section className="sponsor-payment" key={payment.id}>
              <h3>{name}</h3>
              <a
                className={`sponsor-qr ${payment.id}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('查看{name}收款码原图', 'View the original {name} payment code', {
                  name,
                })}
              >
                <img
                  src={url}
                  alt={t('{name}赞助收款码', '{name} donation payment code', { name })}
                />
              </a>
              <a className="sponsor-original" href={url} target="_blank" rel="noopener noreferrer">
                {t('查看原图', 'View original')}
                <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            </section>
          )
        })}
      </div>
      <p className="sponsor-hint">
        {t(
          '使用支付宝或微信扫码，长按图片可保存，也可以打开原图保存。',
          'Scan with Alipay or WeChat. Touch and hold an image to save it, or open the original.',
        )}
      </p>
    </Dialog>
  )
}
