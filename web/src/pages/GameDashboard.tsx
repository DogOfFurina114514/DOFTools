import { BookSpread } from '../components/BookSpread'
import { ArrowRight, ArrowUpRight, Compass, Grid2X2, Radio, Layers } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppearance } from '../lib/appearance'
import { useLocale } from '../lib/i18n'
import { toolTags } from '../data/tags'
import { toolRegistry } from '../tools'
import { ToolIcon } from '../components/ToolIcon'

export function GameDashboard({ pinned }: { pinned: string[] }) {
  const { style } = useAppearance()
  const { t, resolve } = useLocale()
  const tools = toolRegistry.list()
  const pinnedTools = pinned.map((id) => toolRegistry.get(id)).filter((tool) => !!tool)
  const shortcuts = (
    pinnedTools.length
      ? pinnedTools
      : [
          'image-compress',
          'video-compress',
          'video-audio-replace',
          'audio-midi',
          'video-gif',
          'gif-video',
        ]
          .map((id) => toolRegistry.get(id))
          .filter((tool) => !!tool)
  ).slice(0, 6)
  const copy = {
    genshin: [
      '冒险手册',
      'Adventurer’s Handbook',
      '翻开目录，找到今天要用的工具。',
      'Browse the contents and find the tools for today.',
      'ADVENTURER’S HANDBOOK',
    ],
    zenless: [
      '切换频道，开始处理',
      'Tune in. Get things done.',
      '你的文件，你的节奏。挑一个频道，现在开工。',
      'Your files, your rhythm. Pick a channel and get started.',
      'TOOLBOX / ON AIR',
    ],
    endfield: [
      '工具终端已就绪',
      'Tool terminal ready',
      '选择作业类型，准备素材，建立你的下一步。',
      'Choose an operation, prepare your files, and build what comes next.',
      'OPERATIONS TERMINAL',
    ],
    minecraft: [
      '今天，想制作什么？',
      'What will you craft today?',
      '把素材放上制作台，从一个小小的想法开始。',
      'Bring your files to the crafting table. Start with a small idea.',
      'YOUR CRAFTING TABLE',
    ],
  } as const
  const current = copy[style as keyof typeof copy]
  const Emblem =
    style === 'genshin'
      ? Compass
      : style === 'zenless'
        ? Radio
        : style === 'endfield'
          ? Layers
          : Grid2X2
  return (
    <div className={`game-dashboard game-dashboard-${style}`}>
      <BookSpread left={<>
      <section className="game-welcome">
        <div className="game-emblem" aria-hidden="true">
          <Emblem strokeWidth={1} />
          <i />
          <i />
          <i />
        </div>
        <div className="game-welcome-copy">
          <span className="game-kicker">{current[4]}</span>
          <h1>{t(current[0], current[1])}</h1>
          <p>{t(current[2], current[3])}</p>
          <Link to="/tools" className="button game-enter">
            {t('打开所有工具', 'Open all tools')}
            <ArrowRight size={18} />
          </Link>
        </div>
        <div className="game-availability">
          <strong>{String(tools.length).padStart(2, '0')}</strong>
          <span>{t('个可用工具', 'available tools')}</span>
        </div>
      </section>
      <section className="game-tag-section">
        <div className="game-section-heading">
          <span aria-hidden="true">01</span>
          <h2>
            {style === 'genshin' ? t('手册目录', 'Contents') : t('按标签探索', 'Explore by tag')}
          </h2>
        </div>
        <div className="game-tag-menu">
          {toolTags.map((tag, index) => (
            <Link key={tag.id} to={`/tools?tag=${tag.id}`} className="game-tag-link">
              <span className="game-tag-icon">
                <tag.icon size={23} strokeWidth={1.5} />
              </span>
              <span className="game-tag-name">
                {resolve(tag.label)}
                <small>
                  {t('{count} 个工具', '{count} tools', {
                    count: tools.filter((tool) => tool.tags.includes(tag.id)).length,
                  })}
                </small>
              </span>
              <span className="game-tag-number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
            </Link>
          ))}
        </div>
      </section>
      </>} right={<>
      <section className="game-shortcuts">
        <div className="game-section-heading">
          <span aria-hidden="true">02</span>
          <h2>
            {pinnedTools.length
              ? t('已固定的工具', 'Pinned tools')
              : style === 'genshin'
                ? t('工具条目', 'Tool entries')
                : t('从这里开始', 'Start here')}
          </h2>
          <Link to="/tools">
            {t('查看全部', 'View all')}
            <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="game-shortcut-grid">
          {shortcuts.map((tool, index) => {
            return (
              <Link key={tool.id} to={`/tool/${tool.id}`} className="game-tool-link">
                <div className="game-tool-top">
                  <span className="game-tool-icon">
                    <ToolIcon tool={tool} size={25} strokeWidth={1.5} />
                  </span>
                  <span className="game-tool-number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3>{resolve(tool.title)}</h3>
                <p>{resolve(tool.description)}</p>
                <div className="game-tool-bottom">
                  <span>
                    {tool.tags
                      .map((id) => resolve(toolTags.find((tag) => tag.id === id)!.label))
                      .join(' · ')}
                  </span>
                  <ArrowRight size={17} />
                </div>
              </Link>
            )
          })}
        </div>
      </section>
      <div className="game-settings-link">
        <span>{t('偏好保存在当前浏览器', 'Preferences stay in this browser')}</span>
        <Link to="/settings">
          {t('设置与外观', 'Settings & appearance')}
          <ArrowUpRight size={15} />
        </Link>
      </div>
      </>} />
    </div>
  )
}
