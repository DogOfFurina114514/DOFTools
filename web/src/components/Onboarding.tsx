import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Monitor, Moon, Sparkles, Sun, X } from 'lucide-react'
import { useLocale } from '../lib/i18n'
import { useAppearance, type StyleId } from '../lib/appearance'
import { detectAICapability } from '../lib/ai'
import { ToolboxMark } from './Brand'
import { StylePicker, ThemedButton } from './UI'
import { IconButton } from './controls'

export function SetupWizard({
  onFinish,
  onClose,
  onStyle,
}: {
  onFinish: () => void
  onClose: () => void
  onStyle: (style: StyleId) => void
}) {
  const { locale, setLocale, t } = useLocale()
  const { theme, setMode } = useAppearance()
  const [step, setStep] = useState(0)
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])
  const titles = [
    t('先选一种语言', 'Choose your language'),
    t('选择舒服的明暗', 'Choose your color theme'),
    t('选一个喜欢的风格', 'Choose your style'),
  ]
  return (
    <div className="setup-backdrop">
      <div
        ref={dialog}
        className="setup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
          if (event.key !== 'Tab') return
          const elements = [
            ...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []),
          ]
          const first = elements[0],
            last = elements.at(-1)
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === dialog.current)
          ) {
            event.preventDefault()
            last?.focus()
          } else if (
            !event.shiftKey &&
            (document.activeElement === last || document.activeElement === dialog.current)
          ) {
            event.preventDefault()
            first?.focus()
          }
        }}
      >
        <div className="setup-top">
          <ToolboxMark className="setup-mark" />
          <span>{t('让工具箱更像你', 'Make this toolbox yours')}</span>
          <IconButton aria-label={t('关闭向导', 'Close setup')} onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        <ol className="setup-steps" aria-label={t('设置步骤', 'Setup steps')}>
          {[t('语言', 'Language'), t('明暗', 'Color'), t('风格', 'Style')].map((title, index) => (
            <li
              key={index}
              aria-current={step === index ? 'step' : undefined}
              className={index <= step ? 'is-reached' : ''}
            >
              <span>{index < step ? <Check size={14} /> : index + 1}</span>
              {title}
            </li>
          ))}
        </ol>
        <h1 id="setup-title">{titles[step]}</h1>
        <p className="setup-description">
          {step === 0
            ? t(
                '页面和工具会一起切换。之后也可以在右上角调整。',
                'The site and tools change together. You can switch again in the top-right corner.',
              )
            : step === 1
              ? t(
                  '跟随系统会自动响应设备的明暗设置。',
                  'System default follows your device’s light and dark preference.',
                )
              : t(
                  '整个工具箱会采用这个风格。完成后带你熟悉各个页面。',
                  'This style applies to the whole toolbox. Next, take a guided tour of the pages.',
                )}
        </p>
        {step === 0 && (
          <div className="setup-options" role="group" aria-label={t('语言选择', 'Language choice')}>
            <ThemedButton
              variant={locale === 'zh-CN' ? 'primary' : 'secondary'}
              aria-pressed={locale === 'zh-CN'}
              onClick={() => setLocale('zh-CN')}
            >
              中文<span>你好，欢迎。</span>
            </ThemedButton>
            <ThemedButton
              variant={locale === 'en' ? 'primary' : 'secondary'}
              aria-pressed={locale === 'en'}
              onClick={() => setLocale('en')}
            >
              English<span>Hello, welcome.</span>
            </ThemedButton>
          </div>
        )}
        {step === 1 && (
          <div
            className="setup-options color-choices"
            role="group"
            aria-label={t('明暗选择', 'Color theme choice')}
          >
            {(
              [
                { id: 'light', title: t('浅色', 'Light'), icon: Sun },
                { id: 'dark', title: t('深色', 'Dark'), icon: Moon },
                { id: 'system', title: t('跟随系统', 'System default'), icon: Monitor },
              ] as const
            ).map((choice) => (
              <ThemedButton
                key={choice.id}
                variant={theme === choice.id ? 'primary' : 'secondary'}
                aria-pressed={theme === choice.id}
                onClick={() => setMode(choice.id)}
              >
                <choice.icon size={28} />
                {choice.title}
              </ThemedButton>
            ))}
          </div>
        )}
        {step === 2 && <StylePicker onSelect={onStyle} />}
        <div className="setup-actions">
          {step > 0 && (
            <ThemedButton variant="secondary" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} />
              {t('上一步', 'Back')}
            </ThemedButton>
          )}
          <span>{step + 1} / 3</span>
          <ThemedButton onClick={() => (step < 2 ? setStep(step + 1) : onFinish())}>
            {step < 2
              ? t('下一步', 'Next')
              : t('进入工具箱并开始教学', 'Enter toolbox & start tour')}
            <ArrowRight size={16} />
          </ThemedButton>
        </div>
      </div>
    </div>
  )
}

export function GuidedTour({ onFinish }: { onFinish: () => void }) {
  const { t } = useLocale()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [focus, setFocus] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const steps = [
    {
      path: '/',
      target: '.category-section',
      title: t('从所有工具和标签开始', 'Start with All tools and tags'),
      text: t(
        '进入所有工具，或从图片、视频、音频、文档、解析等标签进入。同一个工具可以拥有多个标签。',
        'Open All tools or start from tags such as Image, Video, Audio, Document and Parsing. A tool can have multiple tags.',
      ),
    },
    {
      path: '/tools',
      target: '.tool-tag-filters',
      title: t('组合标签，缩小范围', 'Combine tags to narrow results'),
      text: t(
        '可选择多个标签，只显示同时包含全部标签的工具。例如选择视频和解析，就能找到社交平台解析。清除标签可恢复全部工具。',
        'Select multiple tags to require all of them. Video and Parsing find the social platform parser. Clear tags to see all tools.',
      ),
    },
    {
      path: '/settings',
      target: '.style-settings-section',
      title: t('随时调整外观', 'Change appearance anytime'),
      text: t(
        '语言在右上角切换。明暗、界面风格和开屏动画在这里设置，也可以重新打开本向导。',
        'Switch language in the top-right corner. Change colors, styles and openings here, or restart this guide.',
      ),
    },
    ...(detectAICapability().desktop
      ? [
          {
            path: '/ai',
            target: '.ai-workspace',
            title: t('让 AI 帮你选择和处理', 'Let AI help you choose and process'),
            text: t(
              '先开启助手。只说要求时会展示可前往的工具；附上待处理文件时会执行并返回结果。Enter 发送，Shift+Enter 换行。切换页面保留助手，关闭后释放资源。',
              'Start the assistant. Describe a task to get tool cards, or attach files to process them and receive results. Enter sends; Shift+Enter adds a line. Browsing keeps the assistant active; closing releases it.',
            ),
          },
        ]
      : []),
    {
      path: '/tools',
      target: '.all-tools-search',
      title: t('搜索要求，固定常用工具', 'Search tasks and pin frequent tools'),
      text: t(
        '搜索框在所有工具页面，Ctrl / ⌘ + K 可直接前往。点击工具卡片的图钉，将它固定到侧边栏；再次点击可取消固定。手机上打开导航即可进入固定工具。',
        'Search lives in All tools; Ctrl / ⌘ + K takes you there. Pin a tool card for sidebar access; click again to unpin. On phones, open navigation to access pinned tools.',
      ),
    },
  ]
  const current = steps[step]
  useEffect(() => {
    navigate(current.path)
    card.current?.focus()
  }, [step])
  useEffect(() => {
    let frame = 0
    let alive = true
    const update = () => {
      if (!alive) return
      const element = document.querySelector(current.target)
      if (element) {
        const rect = element.getBoundingClientRect()
        const top = Math.max(8, rect.top - 8),
          bottom = Math.min(innerHeight - 8, rect.bottom + 8)
        setFocus(
          bottom > top
            ? {
                x: Math.max(8, rect.left - 8),
                y: top,
                width: Math.min(innerWidth - 16, rect.width + 16),
                height: bottom - top,
              }
            : null,
        )
      } else setFocus(null)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.querySelector('.main-content')!, { childList: true, subtree: true })
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    const timer = setTimeout(() => {
      document
        .querySelector(current.target)
        ?.scrollIntoView({ block: 'center', behavior: 'instant' })
      schedule()
    }, 180)
    schedule()
    return () => {
      alive = false
      observer.disconnect()
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [step])
  return (
    <>
      {focus && (
        <div
          className="tour-spotlight"
          aria-hidden="true"
          style={{ left: focus.x, top: focus.y, width: focus.width, height: focus.height }}
        />
      )}
      <div
        ref={card}
        className="tour-card"
        role="dialog"
        aria-label={t('使用教学', 'Guided tour')}
        tabIndex={-1}
      >
        <div className="tour-top">
          <span>
            <Sparkles size={16} />
            {t('一起熟悉工具箱', 'Explore the toolbox')} · {step + 1} / {steps.length}
          </span>
          <IconButton aria-label={t('结束教学', 'End tour')} onClick={onFinish}>
            <X size={18} />
          </IconButton>
        </div>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
        <div className="tour-actions">
          {step > 0 && (
            <ThemedButton variant="secondary" onClick={() => setStep(step - 1)}>
              {t('上一步', 'Back')}
            </ThemedButton>
          )}
          <ThemedButton onClick={() => (step < steps.length - 1 ? setStep(step + 1) : onFinish())}>
            {step < steps.length - 1 ? t('下一步', 'Next') : t('开始使用', 'Start exploring')}
            <ArrowRight size={15} />
          </ThemedButton>
        </div>
      </div>
    </>
  )
}
