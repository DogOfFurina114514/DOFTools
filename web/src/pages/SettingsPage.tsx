import { CircleHelp, Monitor, Moon, Play, ShieldCheck, Sun } from 'lucide-react'
import { useAppearance, presetFor, type StyleId } from '../lib/appearance'
import { PageHeading, PreferenceSwitch, StylePicker, ThemedButton } from '../components/UI'
import { useLocale } from '../lib/i18n'
import { styleName, styleOpening } from '../lib/appearance'
import { detectAICapability } from '../lib/ai'
import { Disclosure } from '../components/controls'

export function SettingsPage({
  onStyle,
  onReplay,
  onGuide,
}: {
  onStyle: (style: StyleId) => void
  onReplay: () => void
  onGuide: () => void
}) {
  const { t, locale } = useLocale()
  const { style, theme, setMode, openings, setOpenings, reducedMotion } = useAppearance()
  const preset = presetFor(style)
  return (
    <>
      <PageHeading
        eyebrow="MAKE THIS LITTLE SPACE YOUR OWN"
        title={t('设置与外观', 'Settings & appearance')}
        description={t(
          '喜欢安静，还是喜欢冒险？挑一个属于你的工具箱。',
          'Choose the style that makes this toolbox feel yours.',
        )}
      />
      <section className="style-settings-section">
        <div className="section-heading">
          <div>
            <h2>{t('风格切换', 'Interface style')}</h2>
            <p>
              {t(
                '整站即时切换，下一次打开也会记得。',
                'Changes apply across the site and are saved for next time.',
              )}
            </p>
          </div>
          <span className="current-style-chip">
            {t('当前', 'Current')} · {styleName(style, locale)}
          </span>
        </div>
        <StylePicker onSelect={onStyle} />
      </section>
      <section className="settings-panel">
        <h2>{t('外观与动态', 'Appearance & motion')}</h2>
        <div className="settings-row">
          <div>
            <h3>{t('主题外观', 'Color theme')}</h3>
            <p>{t('在每一种风格下，选择更舒服的明暗。', 'Choose light or dark in every style.')}</p>
          </div>
          <div className="theme-options">
            <ThemedButton
              variant={theme === 'system' ? 'primary' : 'secondary'}
              onClick={() => setMode('system')}
              aria-pressed={theme === 'system'}
            >
              <Monitor size={15} />
              {t('跟随系统', 'System default')}
            </ThemedButton>
            <ThemedButton
              variant={theme === 'light' ? 'primary' : 'secondary'}
              onClick={() => setMode('light')}
              aria-pressed={theme === 'light'}
            >
              <Sun size={15} />
              {t('浅色', 'Light')}
            </ThemedButton>
            <ThemedButton
              variant={theme === 'dark' ? 'primary' : 'secondary'}
              onClick={() => setMode('dark')}
              aria-pressed={theme === 'dark'}
            >
              <Moon size={15} />
              {t('深色', 'Dark')}
            </ThemedButton>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <h3>{t('游戏风格开屏动画', 'Game openings')}</h3>
            <p>
              {t(
                '切换或重新打开游戏风格时播放，可随时跳过。',
                'Play when selecting or reopening a game style. Skip at any time.',
              )}
              {reducedMotion
                ? t(
                    '系统已开启减少动态效果，将使用简短静态过渡。',
                    'Reduced motion is enabled. A brief static transition will be used.',
                  )
                : ''}
            </p>
          </div>
          <PreferenceSwitch
            label={t('游戏风格开屏动画', 'Game openings')}
            checked={openings}
            onChange={setOpenings}
          />
        </div>
        <div className="settings-row">
          <div>
            <h3>{t('再看一次开屏', 'Replay the opening')}</h3>
            <p>
              {preset.game
                ? t(
                    '{style} · {opening}，随界面加载进度播放。',
                    '{style} · {opening}, follows interface loading progress.',
                    { style: styleName(style, locale), opening: styleOpening(style, locale) },
                  )
                : t(
                    '原神、绝区零、终末地和 Minecraft 各有专属开屏。',
                    'Genshin Impact, Zenless Zone Zero, Arknights: Endfield and Minecraft each have an opening.',
                  )}
            </p>
          </div>
          <ThemedButton variant="secondary" disabled={!preset.game} onClick={onReplay}>
            <Play size={14} />
            {t('重播开屏', 'Replay opening')}
          </ThemedButton>
        </div>
      </section>
      <section className="settings-panel about-panel">
        <div className="settings-row">
          <div>
            <h3>{t('欢迎向导', 'Welcome guide')}</h3>
            <p>
              {t(
                '重新选择语言、明暗和风格，再跟着教学熟悉各个页面。',
                'Choose language, colors and style again, then follow a tour of the pages.',
              )}
            </p>
          </div>
          <ThemedButton variant="secondary" onClick={onGuide}>
            <CircleHelp size={16} />
            {t('重新打开向导', 'Restart guide')}
          </ThemedButton>
        </div>
        <h2>{t('关于这个小空间', 'About')}</h2>
        <div className="settings-row">
          <div>
            <h3>{t('芙芙的狗工具箱', 'DogOfFurina Toolbox')}</h3>
            <p>
              {t(
                '五个分类，支持文件转换、音频与 MIDI 转换、网盘链接解析和 ZIP 密码恢复。',
                'Five categories with file conversion, audio and MIDI conversion, cloud drive link parsing and ZIP password recovery.',
              )}
            </p>
          </div>
          <span className="version-badge">v{version}</span>
        </div>
        {detectAICapability().desktop && (
          <div className="settings-row">
            <div>
              <h3>{t('电脑端 AI', 'Desktop AI')}</h3>
              <p>
                {t(
                  '支持对话、图片识别、推荐工具和处理文件。聊天记录保存在本地。',
                  'Chat, understand images, find tools and process files. Conversations are saved locally.',
                )}
              </p>
            </div>
            <Monitor size={23} className="green-text" />
          </div>
        )}
        <div className="settings-row">
          <div>
            <h3>{t('本地偏好', 'Local preferences')}</h3>
            <p>
              {t(
                '风格、明暗和动画偏好保存在当前浏览器。',
                'Language, style, color theme and opening preferences are saved in this browser.',
              )}
            </p>
          </div>
          <ShieldCheck size={23} className="green-text" />
        </div>
      </section>
      <Disclosure className="visual-references" title={t('风格的灵感来源', 'Style references')}>
        <p>
          {t(
            '参考官方视觉元素，以原创图形与动画重新呈现。',
            'Inspired by official visual design, with original graphics and animations.',
          )}
        </p>
        <div>
          <a href="https://m3.material.io/" target="_blank" rel="noreferrer">
            Material Design 3
          </a>
          <a href="https://fluent2.microsoft.design/" target="_blank" rel="noreferrer">
            Fluent Design
          </a>
          <a
            href="https://developer.apple.com/design/human-interface-guidelines/materials"
            target="_blank"
            rel="noreferrer"
          >
            {t('液态玻璃材质', 'Glass materials')}
          </a>
          <a href="https://genshin.hoyoverse.com/en/home" target="_blank" rel="noreferrer">
            {t('原神官网', 'Genshin Impact website')}
          </a>
          <a href="https://zenless.hoyoverse.com/en-us/main" target="_blank" rel="noreferrer">
            {t('绝区零官网', 'Zenless Zone Zero website')}
          </a>
          <a href="https://endfield.gryphline.com/en-us" target="_blank" rel="noreferrer">
            {t('终末地官网', 'Arknights: Endfield website')}
          </a>
          <a href="https://www.minecraft.net/en-us" target="_blank" rel="noreferrer">
            Minecraft
          </a>
        </div>
      </Disclosure>
    </>
  )
}
import { version } from '../../package.json'
