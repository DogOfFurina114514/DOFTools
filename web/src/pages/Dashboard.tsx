import { ArrowRight, ArrowUpRight, Palette, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { categories } from '../data/tools'
import { useAppearance, styleName } from '../lib/appearance'
import { useLocale } from '../lib/i18n'
import { StylePreview } from '../components/UI'

const makeCopy = (t: ReturnType<typeof useLocale>['t']) => ({
  default: t('你的日常，轻一点', 'A little lighter, every day'),
  material: t('让这个空间，更像你', 'Make this space your own'),
  fluent: t('在这里，专注每一件小事', 'A space to focus'),
  glass: t('让灵感，透进这个空间', 'Let your ideas shine through'),
  genshin: t('循着星光，启程', 'Follow the stars'),
  zenless: t('切换频道，随心登场', 'Tune in to your own channel'),
  endfield: t('从这里，建立新的起点', 'Build your next starting point'),
  minecraft: t('从一个方块，开始创造', 'Build from the first block'),
})

export function Dashboard() {
  const { t, resolve, locale } = useLocale()
  const copy = makeCopy(t)
  const { style } = useAppearance()
  return (
    <>
      <div className="page-heading welcome-heading">
        <div>
          <span className="eyebrow">DogOfFurina Toolbox</span>
          <h1>
            {copy[style]}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {t(
              '欢迎来到芙芙的狗工具箱。先留好位置，再慢慢装进喜欢的东西。',
              'Welcome to DogOfFurina Toolbox. A place for the tools you want to add.',
            )}
          </p>
        </div>
        <span className="local-badge">
          <span className="status-dot" />
          {t('框架已就绪', 'Framework ready')}
        </span>
      </div>
      <section className="category-section">
        <div className="section-heading">
          <div>
            <h2>{t('先留五个位置', 'Five spaces to start')}</h2>
            <p>
              {t(
                '图片、视频、音频、文档，还有日常里的其他小事。',
                'Images, videos, audio, documents and everyday utilities.',
              )}
            </p>
          </div>
          <span className="section-note">A PLACE FOR EVERY LITTLE THING</span>
        </div>
        <div className="category-grid">
          {categories.map((category, index) => (
            <Link
              to={`/category/${category.id}`}
              key={category.id}
              className={`category-card ${category.color}`}
            >
              <span className="category-index">0{index + 1}</span>
              <span className="category-icon">
                <category.icon size={25} strokeWidth={1.5} />
              </span>
              <div>
                <h3>{resolve(category.label)}</h3>
                <span>{t('尚未添加工具', 'No tools yet')}</span>
              </div>
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </div>
      </section>
      <section className="home-style-banner">
        <span className="home-style-icon">
          <Palette size={23} strokeWidth={1.5} />
        </span>
        <div>
          <span className="eyebrow">A CHANGE OF SCENERY</span>
          <h2>{t('换一种风格，换一点心情。', 'A different style, a different mood.')}</h2>
          <p>
            {t(
              '普通主题，或走进喜欢的游戏世界。',
              'Choose an everyday theme, or enter a game-inspired world.',
            )}
          </p>
          <Link to="/settings" className="text-button">
            {t('去设置里看看', 'Explore settings')}
            <ArrowRight size={14} />
          </Link>
        </div>
        <div className="current-style-preview">
          <StylePreview style={style} small />
          <span>
            {t('当前风格', 'Current style')} · {styleName(style, locale)}
          </span>
        </div>
      </section>
      <div className="privacy-strip">
        <ShieldCheck size={24} strokeWidth={1.5} />
        <div>
          <strong>{t('一点个性，也一点安心。', 'Personal, and private.')}</strong>
          <p>
            {t(
              '风格和外观偏好只保存在当前浏览器，无需账号。',
              'Language and appearance preferences stay in this browser. No account needed.',
            )}
          </p>
        </div>
        <span className="privacy-decoration">YOUR SPACE · LOCALLY</span>
      </div>
    </>
  )
}
