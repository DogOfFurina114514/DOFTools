import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { X } from 'lucide-react'
import { styleName, type StyleId } from '../lib/appearance'
import { prepareWorkspace } from '../lib/workspace-loader'
import { useLocale } from '../lib/i18n'

const segments = 28
const completionDuration: Record<string, number> = {
  genshin: 1900,
  zenless: 540,
  endfield: 560,
  minecraft: 650,
}
const fadeDuration: Record<string, number> = {
  genshin: 650,
  zenless: 400,
  endfield: 720,
  minecraft: 600,
}
const elementNames = ['Pyro', 'Hydro', 'Anemo', 'Electro', 'Dendro', 'Cryo', 'Geo']

function ElementGlyph({ index }: { index: number }) {
  const src = `${import.meta.env.BASE_URL}assets/elements/${elementNames[index].toLowerCase()}.png`
  return (
    <span
      className="element-glyph"
      style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
    />
  )
}

export function SplashScreen({
  style,
  reducedMotion,
  onFinish,
  onReveal,
  returnFocus,
}: {
  style: StyleId
  reducedMotion: boolean
  onFinish: () => void
  onReveal: () => void
  returnFocus?: HTMLElement | null
}) {
  const { t, locale } = useLocale()
  const skip = useRef<HTMLButtonElement>(null)
  const finish = useRef(onFinish)
  finish.current = onFinish
  const reveal = useRef(onReveal)
  reveal.current = onReveal
  const [loaded, setLoaded] = useState(0)
  const [shownSegments, setShownSegments] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'complete' | 'exiting'>('loading')
  const [error, setError] = useState(false)
  const progress = Math.floor((shownSegments / segments) * 100)
  const fade = reducedMotion ? 140 : fadeDuration[style]
  useEffect(() => {
    const controller = new AbortController()
    void prepareWorkspace(controller.signal, setLoaded).catch((error) => {
      if (!controller.signal.aborted) {
        console.error('Opening resources:', error)
        setError(true)
      }
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const target = Math.floor(loaded * segments)
    if (shownSegments < target) {
      if (reducedMotion) setShownSegments(target)
      else {
        // Disclose finished work one tile at a time, never advance past real loading.
        const timer = setTimeout(() => setShownSegments((value) => value + 1), 26)
        return () => clearTimeout(timer)
      }
    } else if (loaded === 1 && shownSegments === segments && phase === 'loading') {
      setPhase('complete')
    }
  }, [loaded, shownSegments, phase, reducedMotion])

  useEffect(() => {
    if (phase === 'loading') return
    const timer = setTimeout(
      () => {
        if (phase === 'complete') {
          // The exit starts from a fully opaque yellow/white layer, with the ready page beneath.
          reveal.current()
          setPhase('exiting')
        } else finish.current()
      },
      phase === 'complete' ? (reducedMotion ? 120 : completionDuration[style]) : fade,
    )
    return () => clearTimeout(timer)
  }, [phase, style, reducedMotion, fade])
  useEffect(() => {
    const previous = returnFocus ?? (document.activeElement as HTMLElement | null)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    skip.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish.current()
      }
      if (event.key === 'Tab') {
        const buttons = Array.from(
          skip.current?.closest('.opening')?.querySelectorAll<HTMLButtonElement>('button') ?? [],
        )
        const first = buttons[0]
        const last = buttons.at(-1)
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !buttons.includes(document.activeElement as HTMLButtonElement))
        ) {
          event.preventDefault()
          last?.focus()
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !buttons.includes(document.activeElement as HTMLButtonElement))
        ) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    window.addEventListener('keydown', key)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', key)
      previous?.focus()
    }
  }, [reducedMotion, style, returnFocus])

  return (
    <div
      className={`opening opening-${style} is-${phase}`}
      data-phase={phase}
      data-progress={progress}
      data-loaded={Math.floor(loaded * 100)}
      style={
        {
          '--load-progress': `${progress}%`,
          '--opening-fade-duration': `${fade}ms`,
        } as CSSProperties
      }
      role="dialog"
      aria-modal="true"
      aria-label={t('{style}开屏动画', '{style} opening', { style: styleName(style, locale) })}
    >
      <button ref={skip} className="opening-skip" onClick={onFinish}>
        {t('跳过', 'Skip')}
        <X size={13} />
      </button>
      {style === 'minecraft' ? (
        <>
          <div className="minecraft-panorama" aria-hidden="true">
            <span className="minecraft-sun" />
            <i className="minecraft-cloud cloud-a" />
            <i className="minecraft-cloud cloud-b" />
            <div className="minecraft-hills" />
            <div className="minecraft-ground" />
          </div>
          <div className="minecraft-opening-content">
            <span className="minecraft-wordmark" aria-hidden="true">
              DOGOFFURINA
              <br />
              <small>TOOLBOX</small>
            </span>
            <h1>{t('芙芙的狗工具箱', 'DogOfFurina Toolbox')}</h1>
            <p>
              {phase === 'loading'
                ? t('正在准备你的方块世界', 'Preparing your block world')
                : t('世界已准备就绪', 'Your world is ready')}
            </p>
            <div
              className="minecraft-loading-grid"
              role="progressbar"
              aria-label={t('界面加载进度', 'Interface loading progress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              {Array.from({ length: segments }, (_, index) => (
                <span
                  key={index}
                  className={index < shownSegments ? 'is-loaded' : ''}
                  aria-hidden="true"
                />
              ))}
            </div>
            <b className="minecraft-progress-number">{progress}%</b>
          </div>
          <span className="minecraft-opening-cover" aria-hidden="true" />
        </>
      ) : style === 'endfield' ? (
        <>
          <div className="endfield-landscape" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <span className="endfield-boot-label">INITIALIZING / PERSONAL WORKSPACE</span>
          <div className="endfield-wordmark">
            <span className="endfield-letterspacing">D O G O F F U R I N A</span>
            <div aria-hidden="true">
              <b>TOOL</b>
              <b>BOX</b>
            </div>
            <h1>{t('芙芙的狗工具箱', 'DogOfFurina Toolbox')}</h1>
          </div>
          <div className="endfield-boot-info">
            <div className="endfield-signals">
              <span className="endfield-hazard" aria-hidden="true">
                ▾
              </span>
              <div>
                <small>MISSION / PERSONAL SPACE</small>
                <small>SYSTEM INTERFACE</small>
                <span className="endfield-loading-blocks">▰ ▰ ▰ ▰ ▰ ▰ ▰ ▰</span>
              </div>
            </div>
            <p>OVER THE FRONTIER / INTO YOUR WORKSPACE</p>
          </div>
          <div
            className="endfield-loading-rail"
            role="progressbar"
            aria-label={t('界面加载进度', 'Interface loading progress')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <i />
            <span>
              {String(progress).padStart(2, '0')}
              <span className="endfield-percent">%</span>
              <br />
              <small>{phase === 'loading' ? 'LOADING' : 'READY'}</small>
            </span>
          </div>
          <span className="endfield-yellow-wipe" aria-hidden="true" />
        </>
      ) : style === 'zenless' ? (
        <>
          <div className="zone-static" aria-hidden="true" />
          <div className="zone-channel">
            CH. 06 <span>DOGOFFURINA NETWORK</span>
          </div>
          <div className="zone-loader">
            <span className="zone-now">NOW</span>
            <strong>
              LOADING<span>…</span>
            </strong>
            <div
              className="zone-track"
              role="progressbar"
              aria-label={t('界面加载进度', 'Interface loading progress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              {Array.from({ length: segments }, (_, index) => (
                <span
                  key={index}
                  className={`zone-segment ${index < shownSegments ? 'is-loaded' : ''}`}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="zone-progress-caption">
              <span>
                {error
                  ? 'CONNECTION INTERRUPTED'
                  : phase === 'loading'
                    ? 'CONNECTING TO YOUR WORKSPACE'
                    : 'READY TO PLAY'}
              </span>
              <b>{String(progress).padStart(2, '0')}%</b>
            </div>
            <h1>{t('芙芙的狗工具箱', 'DogOfFurina Toolbox')}</h1>
            <p>
              {t('WELCOME TO YOUR ZONE / 频道接入', 'WELCOME TO YOUR ZONE / CHANNEL CONNECTED')}
            </p>
          </div>
          <div className="zone-footer">
            <span>▶ YOUR CHANNEL. YOUR RULES.</span>
            <span>{phase === 'loading' ? 'NO SIGNAL → CONNECTING' : 'SIGNAL → CONNECTED'}</span>
          </div>
          <span className="zone-shutter" aria-hidden="true" />
        </>
      ) : (
        <>
          <div className="celestial-clouds" aria-hidden="true">
            <i />
            <i />
          </div>
          <div className="celestial-road" aria-hidden="true">
            {Array.from({ length: 14 }, (_, index) => (
              <div
                className={`celestial-road-tile ${index < Math.floor(shownSegments / 2) ? 'is-built' : ''}`}
                key={index}
                style={{ '--tile-index': index } as CSSProperties}
              >
                <i />
                <i />
                <span>✧</span>
              </div>
            ))}
            <div className="celestial-road-glow" />
          </div>
          {phase !== 'loading' && (
            <div className="celestial-gate" aria-hidden="true">
              <span className="gate-top">✧</span>
              <i className="gate-left" />
              <i className="gate-right" />
              <span className="gate-light" />
            </div>
          )}
          <div className="celestial-title">
            <span>✦</span>
            <h1>{t('芙芙的狗工具箱', 'DogOfFurina Toolbox')}</h1>
            <p>
              {phase === 'loading'
                ? t('循着星光，铺就通往彼端的道路', 'Follow the stars as the road takes shape')
                : t('星门已开启，旅程即将开始', 'The road is ready. The gate is opening.')}
            </p>
          </div>
          <div
            className="celestial-elements"
            role="progressbar"
            aria-label={t('元素加载进度', 'Element loading progress')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={t(
              '{progress}%，已点亮 {count} 个元素',
              '{progress}%, {count} elements lit',
              { progress, count: Math.floor(shownSegments / 4) },
            )}
          >
            {elementNames.map((name, index) => (
              <span
                key={name}
                data-element={name}
                className={index < Math.floor(shownSegments / 4) ? 'is-loaded' : ''}
                aria-hidden="true"
              >
                <ElementGlyph index={index} />
              </span>
            ))}
          </div>
          <span className="celestial-whiteout" aria-hidden="true" />
        </>
      )}
      <div
        className={`opening-load-status ${error ? 'has-error' : ''}`}
        role={error ? 'alert' : 'status'}
      >
        {error ? (
          <>
            <span>{t('部分界面资源未能加载', 'Some interface resources could not load')}</span>
            <button onClick={() => window.location.reload()}>{t('重新加载', 'Reload')}</button>
          </>
        ) : (
          <span>
            {phase === 'loading'
              ? t('正在准备界面', 'Preparing the interface')
              : t('准备就绪', 'Ready')}
            {style === 'genshin' ? ` · ${progress}%` : ''}
          </span>
        )}
      </div>
    </div>
  )
}
