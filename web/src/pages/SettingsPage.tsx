import { useEffect, useState } from 'react'
import {
  CircleHelp,
  Database,
  Download,
  Monitor,
  Moon,
  Play,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
} from 'lucide-react'
import { useAppearance, presetFor, type StyleId } from '../lib/appearance'
import { PageHeading, PreferenceSwitch, StylePicker, ThemedButton } from '../components/UI'
import { useLocale } from '../lib/i18n'
import { styleName, styleOpening } from '../lib/appearance'
import { detectAICapability } from '../lib/ai'
import { Disclosure, Progress, Select } from '../components/controls'
import {
  DOWNLOAD_THREADS,
  modelDownloadThreads,
  type DownloadThreads,
} from '../lib/download-preferences'
import { ColorChoices } from '../components/ColorChoices'
import type { OrdinaryStyle } from '../lib/theme-colors'
import {
  clearModelResources,
  checkResourceUpdates,
  downloadModelResources,
  refreshResourceStatus,
  retryOfflineSave,
  setModelDownloadThreads,
  setOfflineEnabled,
  useOfflineStatus,
  useOnlineStatus,
} from '../lib/offline'

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
  const {
    style,
    theme,
    setMode,
    openings,
    setOpenings,
    reducedMotion,
    accentColors,
    setAccentColor,
    resetAccentColor,
    glassGradient,
    setGlassGradient,
  } = useAppearance()
  const defaultAccent = {
    default: '#617e53',
    material: '#6750a4',
    fluent: '#0f6cbd',
    glass: '#2864af',
  }
  const gradientPresets = [
    { colors: ['#a7d0ff', '#f0bbd8'], zh: '晴空与樱花', en: 'Sky & blossom' },
    { colors: ['#6fc9bd', '#a5b8ee'], zh: '青碧与暮蓝', en: 'Teal & dusk' },
    { colors: ['#ffc78a', '#e9a0c5'], zh: '杏色与玫瑰', en: 'Apricot & rose' },
    { colors: ['#bba4eb', '#86c9e8'], zh: '薰衣草与海蓝', en: 'Lavender & ocean' },
  ]
  const preset = presetFor(style)
  const desktop = detectAICapability().desktop
  const resources = useOfflineStatus()
  const online = useOnlineStatus()
  const [detecting, setDetecting] = useState(false)
  const [threads, setThreads] = useState(modelDownloadThreads)
  useEffect(() => {
    void refreshResourceStatus()
  }, [])
  const detectResources = async () => {
    setDetecting(true)
    try {
      await refreshResourceStatus()
    } finally {
      setDetecting(false)
    }
  }
  const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`
  const resourceStatus = {
    idle: resources.enabled
      ? t('本地资源未检测', 'Local resources have not been checked')
      : t('未开启整站离线使用', 'Full offline use is disabled'),
    checking: t('正在检查版本与已保存资源…', 'Checking the version and saved resources…'),
    saving: resources.updating
      ? t('正在增量更新离线资源…', 'Updating changed offline resources…')
      : t('正在下载并保存离线资源…', 'Downloading and saving offline resources…'),
    ready: t('离线资源已就绪 · {version}', 'Offline resources ready · {version}', {
      version: resources.version,
    }),
    incomplete: t(
      '检测完成：离线资源尚未保存完整',
      'Checked: offline resources are not fully saved',
    ),
    clearing: t('正在清除资源…', 'Clearing saved resources…'),
    error: t('资源保存未完成，请重试', 'Resources could not be saved. Please retry'),
  }[resources.phase]
  const modelStatus = {
    idle: t('本地模型未检测', 'Local models have not been checked'),
    checking: t('正在检查本地模型资源…', 'Checking saved model resources…'),
    saving: t('正在下载并保存模型…', 'Downloading and saving models…'),
    ready: t('模型资源已保存', 'Model resources saved'),
    incomplete:
      resources.modelsBytes > 0
        ? t('检测完成：模型资源尚未保存完整', 'Checked: model resources are not fully saved')
        : t('检测完成：尚未保存模型资源', 'Checked: no model resources saved'),
    clearing: t('正在清除模型资源…', 'Clearing model resources…'),
    error: t('模型下载未完成，请重试', 'Model download is incomplete. Please retry'),
  }[resources.modelPhase]
  const cacheError = (error: string) => {
    const resourceMessages = [
      [
        'Offline bundle verification failed: ',
        '离线资源包校验失败：{file}，请重试保存。',
        'Offline resource verification failed: {file}. Retry saving.',
      ],
      [
        'Resource download timed out: ',
        '网站资源下载超时：{file}，请检查网络后重试。',
        'Site resource download timed out: {file}. Check your connection and retry.',
      ],
      [
        'Resource download failed: ',
        '网站资源下载失败：{file}，请检查网络后重试。',
        'Site resource download failed: {file}. Check your connection and retry.',
      ],
      [
        'Incomplete resource: ',
        '网站资源不完整：{file}，请重试保存。',
        'Site resource is incomplete: {file}. Retry saving.',
      ],
      [
        'Resource checksum mismatch: ',
        '资源校验失败：{file}，请重试下载。',
        'Resource verification failed: {file}. Retry downloading.',
      ],
    ]
    for (const [prefix, zh, en] of resourceMessages)
      if (error.startsWith(prefix)) return t(zh, en, { file: error.slice(prefix.length) })
    return error === 'quota'
      ? t(
          '浏览器空间不足，请释放空间后重试。',
          'Browser storage is full. Free some space and retry.',
        )
      : error === 'unsupported'
        ? t(
            '请在支持 Service Worker 的浏览器中通过 HTTPS 打开发布版网站。',
            'Open the published HTTPS site in a browser that supports Service Workers.',
          )
        : error === 'offline'
          ? t(
              '当前处于离线状态，请联网后下载资源。',
              'You are offline. Connect to the internet to download resources.',
            )
          : t('资源操作失败：{error}', 'Resource operation failed: {error}', { error })
  }
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
      {!preset.game && (
        <section className="settings-panel appearance-colors">
          <h2>{t('主题色', 'Theme accent')}</h2>
          <div className="settings-row color-settings-row">
            <div>
              <h3>{t('选择主题色', 'Choose an accent color')}</h3>
              <p>
                {t(
                  '分别记住每种普通主题的颜色，按钮与选中状态即时更新。',
                  'Each standard theme remembers its own color. Buttons and selection colors update immediately.',
                )}
              </p>
              <ThemedButton variant="secondary" onClick={resetAccentColor}>
                {t('恢复主题默认色', 'Restore default accent')}
              </ThemedButton>
            </div>
            <ColorChoices
              label={t('主题色', 'Theme accent')}
              value={accentColors[style as OrdinaryStyle] ?? defaultAccent[style as OrdinaryStyle]}
              onChange={setAccentColor}
            />
          </div>
          {style === 'glass' && (
            <div className="glass-gradient-settings">
              <h3>{t('双色渐变背景', 'Two-color gradient background')}</h3>
              <p>
                {t(
                  '选择一组配色，或分别输入两端的颜色。背景随深浅主题调整亮度。',
                  'Choose a color pair or enter both colors. The background adjusts its brightness for light and dark themes.',
                )}
              </p>
              <div
                className="gradient-presets"
                role="group"
                aria-label={t('渐变配色', 'Gradient presets')}
              >
                {gradientPresets.map(({ colors, zh, en }) => (
                  <button
                    type="button"
                    key={zh}
                    aria-label={t(zh, en)}
                    aria-pressed={colors.every((color, index) => color === glassGradient[index])}
                    onClick={() => setGlassGradient(colors as [string, string])}
                  >
                    <span
                      style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
                    />
                    {t(zh, en)}
                  </button>
                ))}
              </div>
              <div className="gradient-color-fields">
                <ColorChoices
                  label={t('渐变起始色', 'Gradient start')}
                  value={glassGradient[0]}
                  onChange={(color) => setGlassGradient([color, glassGradient[1]])}
                />
                <ColorChoices
                  label={t('渐变结束色', 'Gradient end')}
                  value={glassGradient[1]}
                  onChange={(color) => setGlassGradient([glassGradient[0], color])}
                />
              </div>
            </div>
          )}
        </section>
      )}
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
      <section className="settings-panel resource-settings">
        <h2>
          <Database size={20} />
          {t('资源与离线使用', 'Resources & offline use')}
        </h2>
        <div className="settings-row">
          <div>
            <h3>{t('允许离线使用', 'Allow offline use')}</h3>
            <p>
              {t(
                '开启后在后台保存模型以外的所有页面、工具和运行环境，完成时通知。联网时自动增量更新，仅下载新增或变化的资源块；关闭后清除这些离线资源。',
                'Save all pages, tools and runtimes except model files in the background and notify when ready. Automatically update online by downloading only new or changed resource blocks. Turning this off clears these offline resources.',
              )}
              {desktop && t('模型在下方独立管理。', ' Manage models separately below.')}
            </p>
          </div>
          <PreferenceSwitch
            label={t('允许离线使用', 'Allow offline use')}
            checked={resources.enabled}
            onChange={(value) => {
              void setOfflineEnabled(value)
            }}
            disabled={resources.phase === 'clearing'}
          />
        </div>
        <div className="resource-status" role="status" aria-live="polite">
          <strong>{online ? resourceStatus : t('离线', 'Offline')}</strong>
          {!online && resources.phase === 'ready' && <p>{resourceStatus}</p>}
          {resources.phase === 'saving' && (
            <>
              <Progress
                label={
                  resources.updating
                    ? t('增量更新进度', 'Incremental update progress')
                    : t('离线保存进度', 'Offline saving progress')
                }
                value={
                  resources.total > (resources.reusedBytes ?? 0)
                    ? (resources.loaded - (resources.reusedBytes ?? 0)) /
                      (resources.total - (resources.reusedBytes ?? 0))
                    : undefined
                }
                decimals={2}
              />
              <p>
                {t('本地保存：{loaded} / {total}', 'Saved locally: {loaded} / {total}', {
                  loaded: size(resources.loaded),
                  total: size(resources.total),
                })}
              </p>
              {(resources.downloadTotal ?? 0) > 0 && (
                <p>
                  {t('下载数据：{loaded} / {total}', 'Downloaded data: {loaded} / {total}', {
                    loaded: size(resources.downloadLoaded ?? 0),
                    total: size(resources.downloadTotal ?? 0),
                  })}
                </p>
              )}
              <p className="resource-file">
                {resources.file || t('正在开始下载…', 'Starting downloads…')}
              </p>
            </>
          )}
          {['saving', 'ready'].includes(resources.phase) && (resources.reusedBytes ?? 0) > 0 && (
            <p>
              {t('已复用本地资源：{size}', 'Reused local resources: {size}', {
                size: size(resources.reusedBytes ?? 0),
              })}
            </p>
          )}
          {resources.phase === 'ready' && resources.downloadLoaded !== undefined && (
            <p>
              {t('本次下载：{size}', 'Downloaded this time: {size}', {
                size: size(resources.downloadLoaded),
              })}
            </p>
          )}
          {(resources.phase === 'checking' || resources.phase === 'clearing') && (
            <Progress label={resourceStatus} />
          )}
          {online && resources.error && (
            <p className="resource-error">{cacheError(resources.error)}</p>
          )}
          <div className="resource-actions">
            <ThemedButton
              variant="secondary"
              disabled={detecting || ['checking', 'saving', 'clearing'].includes(resources.phase)}
              onClick={() => {
                void detectResources()
              }}
            >
              <ShieldCheck size={15} />
              {detecting ? t('正在检测…', 'Checking…') : t('手动检测资源', 'Check saved resources')}
            </ThemedButton>
            <ThemedButton
              variant="secondary"
              disabled={!online || ['checking', 'saving', 'clearing'].includes(resources.phase)}
              onClick={() => {
                void checkResourceUpdates()
              }}
            >
              <RefreshCw size={15} />
              {t('检查更新', 'Check for updates')}
            </ThemedButton>
          </div>
          {online &&
            resources.enabled &&
            ['idle', 'incomplete', 'error'].includes(resources.phase) && (
              <ThemedButton
                variant="secondary"
                onClick={() => {
                  void retryOfflineSave()
                }}
              >
                {t('继续保存离线资源', 'Resume saving offline resources')}
              </ThemedButton>
            )}
        </div>
        <div className="settings-row">
          <div>
            <h3>{t('下载线程', 'Download threads')}</h3>
            <p>
              {t(
                '默认 64。用于离线资源保存与模型下载，完成的线程立即领取下一块。网站保存遇到慢网或超时会自动降低并发重试。',
                'Default: 64. Shared by offline resource saving and model downloads. Each completed download immediately takes the next block. Site saving automatically reduces concurrency on slow networks or timeouts and retries.',
              )}
            </p>
          </div>
          <div className="resource-thread-picker">
            <Select
              label={t('下载线程数', 'Download threads')}
              value={String(threads)}
              options={DOWNLOAD_THREADS.map((value) => ({
                value: String(value),
                label: t('{count} 线程', '{count} threads', { count: value }),
              }))}
              onValueChange={(value) => {
                const next = Number(value) as DownloadThreads
                setThreads(next)
                setModelDownloadThreads(next)
              }}
            />
          </div>
        </div>
        {desktop && (
          <>
            <div className="settings-row">
              <div>
                <h3>{t('本地模型资源', 'Saved model resources')}</h3>
                <p>
                  {t(
                    '模型独立保存在当前浏览器，下次直接读取。已保存 {size}。下载完整 AI 模型后可离线使用 AI；清除后需重新下载。',
                    'Models are saved separately in this browser and reused on the next load. Saved: {size}. Download the complete AI model to use AI offline; clearing it requires another download.',
                    { size: size(resources.modelsBytes) },
                  )}
                </p>
              </div>
              <div className="resource-actions">
                <ThemedButton
                  variant="secondary"
                  disabled={
                    !online || ['checking', 'saving', 'clearing'].includes(resources.modelPhase)
                  }
                  onClick={() => {
                    void downloadModelResources()
                  }}
                >
                  <Download size={15} />
                  {t('下载模型资源', 'Download model resources')}
                </ThemedButton>
                <ThemedButton
                  variant="secondary"
                  disabled={resources.modelPhase === 'clearing'}
                  onClick={() => {
                    void clearModelResources()
                  }}
                >
                  <Trash2 size={15} />
                  {t('清除模型资源', 'Clear model resources')}
                </ThemedButton>
              </div>
            </div>
            <div className="resource-status" role="status" aria-live="polite">
              <strong>{online ? modelStatus : t('离线', 'Offline')}</strong>
              {!online && resources.aiReady && (
                <p>
                  {t(
                    '模型资源已保存，可离线使用 AI',
                    'Model resources saved. AI is available offline',
                  )}
                </p>
              )}
              {resources.modelPhase === 'saving' && (
                <>
                  <Progress
                    label={t('模型保存进度', 'Model saving progress')}
                    value={
                      resources.modelTotal
                        ? resources.modelLoaded / resources.modelTotal
                        : undefined
                    }
                    decimals={2}
                  />
                  <p>
                    {size(resources.modelLoaded)} / {size(resources.modelTotal)}
                  </p>
                  <p className="resource-file">
                    {resources.modelFile || t('正在开始下载…', 'Starting downloads…')}
                  </p>
                </>
              )}
              {['checking', 'clearing'].includes(resources.modelPhase) && (
                <Progress label={modelStatus} />
              )}
              {online && resources.modelError && (
                <p className="resource-error">{cacheError(resources.modelError)}</p>
              )}
            </div>
          </>
        )}
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
                '通过标签与搜索查找工具，可将常用工具固定到侧边栏。支持本地压缩、转换、MIDI、网盘及社交平台解析，社交解析可选择画质等媒体选项。',
                'Find tools by tags and search, and pin frequent tools to the sidebar. Includes local compression, conversion, MIDI, cloud drive and social platform parsing with media quality options.',
              )}
            </p>
          </div>
          <span className="version-badge">v{version}</span>
        </div>
        {desktop && (
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
