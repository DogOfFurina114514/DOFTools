import { BookSpread } from '../components/BookSpread'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  Download,
  Eye,
  Laptop,
  LoaderCircle,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Unplug,
  X,
} from 'lucide-react'
import { detectAICapability } from '../lib/ai'
import { useLocalAI, type ChatItem } from '../lib/ai-session'
import { EmptyPanel, PageHeading } from '../components/UI'
import { IconButton } from '../components/controls'
import { ChatMarkdown } from '../components/ChatMarkdown'
import { ToolUI, toolRegistry } from '../tools'
import { ToolIcon } from '../components/ToolIcon'
import { useLocale } from '../lib/i18n'
import { bilingual, type DisplayText } from '../lib/locale'
import { useStoredState } from '../lib/storage'
import { useAppearance } from '../lib/appearance'
import { ToolLink } from '../lib/tool-launch'

function LocalImage({ blob, alt }: { blob: Blob; alt: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(blob)
    setUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return url ? <img src={url} alt={alt} /> : null
}
const canPreview = (blob: Blob) =>
  ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(blob.type)

function Message({ item }: { item: ChatItem }) {
  const { t, resolve } = useLocale()
  return (
    <article className={`ai-message message-${item.role}`}>
      <span className="ai-message-label">
        {item.role === 'user'
          ? t('你', 'You')
          : item.role === 'tool'
            ? t('工具结果', 'Tool result')
            : item.pending && item.thinking
              ? t('正在思考', 'Thinking')
              : t('AI 助手', 'AI assistant')}
        {item.pending && <LoaderCircle size={12} className="spin" />}
      </span>
      {item.image && (
        <LocalImage
          blob={item.image}
          alt={t('对话中的本地图片', 'Local image in this conversation')}
        />
      )}
      <div className={`ai-message-content ${item.role === 'assistant' ? 'chat-markdown' : ''}`}>
        {item.role === 'assistant' && resolve(item.text) ? (
          <ChatMarkdown>{resolve(item.text)}</ChatMarkdown>
        ) : (
          resolve(item.text) ||
          (item.pending
            ? item.thinking
              ? t('正在思考…', 'Thinking…')
              : t('正在生成回答…', 'Generating an answer…')
            : item.interrupted
              ? t('已停止', 'Stopped')
              : t('未生成文字', 'No text generated'))
        )}
      </div>
      {item.attachments?.map((file, index) => (
        <span className="ai-file-chip" key={`${file.name}-${index}`}>
          <Paperclip size={13} />
          {file.name}
        </span>
      ))}
      {item.tools?.map((tool) => (
        <ToolLink className="ai-tool-card" toolId={tool.id} key={tool.id}>
          <span className="ai-tool-icon">
            <ToolIcon tool={toolRegistry.get(tool.id) ?? tool} size={24} />
          </span>
          <div>
            <strong>{resolve(tool.title)}</strong>
            <p>{resolve(tool.description)}</p>
          </div>
          <span>
            {t('前往工具', 'Open tool')}
            <ArrowUpRight size={16} />
          </span>
        </ToolLink>
      ))}
      {item.pending && item.progress !== undefined && (
        <ToolUI.Progress label={t('正在处理', 'Processing')} value={item.progress} />
      )}
      {item.outputs?.map((file, index) => (
        <div className="ai-output-file" key={`${file.name}-${index}`}>
          {canPreview(file.blob) && <LocalImage blob={file.blob} alt={file.name} />}
          <ToolUI.Button
            variant="secondary"
            onClick={() => {
              const url = URL.createObjectURL(file.blob)
              const link = document.createElement('a')
              link.href = url
              link.download = file.name
              link.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            }}
          >
            <Download size={15} />
            {t('下载', 'Download')} {file.name}
          </ToolUI.Button>
        </div>
      ))}
      {item.role === 'assistant' && !item.pending && item.interrupted && (
        <small>{t('已停止生成', 'Generation stopped')}</small>
      )}
    </article>
  )
}

export function AIPage({
  desktopWindow,
}: {
  desktopWindow?: {
    close: () => void
    onClose: (unload: () => void) => () => void
  }
}) {
  const [noticeDismissed, setNoticeDismissed] = useStoredState(
    'ai-notice-dismissed',
    false,
    (value): value is boolean => typeof value === 'boolean',
  )
  const { t, resolve } = useLocale()
  const capability = detectAICapability()
  const ai = useLocalAI()
  useLayoutEffect(() => desktopWindow?.onClose(ai.unload), [desktopWindow, ai.unload])
  const navigate = useNavigate()
  const prompt = ai.draft
  const files = ai.attachments
  const [fileError, setFileError] = useState<DisplayText>('')
  const input = useRef<HTMLInputElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const rightPage = useRef<HTMLDivElement>(null)
  const { style } = useAppearance()
  const embedded = Boolean(desktopWindow)
  const follow = useRef(true)
  useEffect(() => {
    if (!follow.current) return
    if (embedded && transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight
    else if (style === 'genshin' && rightPage.current)
      rightPage.current.scrollTop = rightPage.current.scrollHeight
    else end.current?.scrollIntoView({ block: 'nearest' })
  }, [ai.chat, style, embedded])
  if (!capability.desktop)
    return (
      <BookSpread
        left={
          <EmptyPanel
            icon={<Laptop size={30} />}
            title={t('AI 助手仅在电脑端提供', 'AI is available on desktop')}
            description={t(
              '请在电脑浏览器中打开。手机和平板可以使用所有工具、筛选标签与切换风格。',
              'Open this page on a desktop browser. Phones and tablets can use All tools, filter tags and switch styles.',
            )}
          />
        }
        right={
          <Link to="/tools" className="button">
            {t('所有工具', 'All tools')}
          </Link>
        }
      />
    )
  const busy = ai.status === 'generating'
  const loading = ai.status === 'loading'
  const loadLabel = {
    starting: t('正在启动助手', 'Starting the assistant'),
    gpu: t('正在检测显卡', 'Checking your GPU'),
    connecting: t('正在连接模型资源', 'Connecting to model resources'),
    config: t('正在读取模型配置', 'Reading the model configuration'),
    cache: t('正在读取本地模型资源', 'Reading saved model resources'),
    runtime: t('正在下载运行环境', 'Downloading the runtime'),
    tokenizer: t('正在下载词表', 'Downloading the tokenizer'),
    weights: t('正在下载模型权重', 'Downloading model weights'),
    initializing: t('正在初始化模型', 'Initializing the model'),
  }[ai.loadStage]
  const downloading = ['cache', 'runtime', 'tokenizer', 'weights'].includes(ai.loadStage)
  const ready = ai.status === 'ready' || busy
  const statusText = loading
    ? loadLabel
    : busy
      ? t('正在处理', 'Working')
      : ready
        ? t('已就绪', 'Ready')
        : t('未开启', 'Not started')
  const send = () => {
    if (ai.status !== 'ready' || !ai.storageReady || (!prompt.trim() && !files.length)) return
    follow.current = true
    void ai.send(prompt, files)
    ai.setDraft('')
    ai.setAttachments([])
    setFileError('')
  }
  const heading = (
    <PageHeading
      className="ai-page-heading"
      eyebrow="YOUR PERSONAL ASSISTANT"
      title={t('AI 助手', 'AI assistant')}
      description={t(
        '告诉我想做什么，或附上文件让我来处理。',
        'Tell me what you want to do, or attach files for me to process.',
      )}
    />
  )
  return (
    <>
      {style !== 'genshin' && !desktopWindow && heading}
      <div className="ai-workspace">
        <BookSpread
          rightRef={rightPage}
          onRightScroll={(event) => {
            if (style !== 'genshin') return
            const page = event.currentTarget
            follow.current = page.scrollHeight - page.scrollTop - page.clientHeight < 90
          }}
          left={
            <>
              {style === 'genshin' && heading}
              <div className="ai-workspace-bar">
                <span>
                  <Sparkles size={18} />
                  {t('AI 助手', 'AI assistant')}
                </span>
                <span className="model-status">
                  <span className={`status-dot ${ready ? '' : 'pending'}`} />
                  {statusText}
                </span>
                <IconButton
                  onClick={() => {
                    if (desktopWindow) desktopWindow.close()
                    else {
                      ai.unload()
                      navigate('/')
                    }
                  }}
                  aria-label={t('关闭 AI 助手', 'Close AI assistant')}
                >
                  <X size={20} />
                </IconButton>
              </div>
              {!ready && (
                <div className="ai-model-loader">
                  <div>
                    <Sparkles size={23} />
                    <div>
                      <h2>{loading ? loadLabel : t('准备好就开始吧', 'Ready when you are')}</h2>
                      <p>
                        {t(
                          '对话和文件都留在这台电脑上。',
                          'Your conversations and files stay on this computer.',
                        )}
                      </p>
                    </div>
                  </div>
                  {loading ? (
                    <>
                      <ToolUI.Progress
                        label={
                          downloading ? t('资源加载进度', 'Resource loading progress') : loadLabel
                        }
                        value={downloading ? ai.progress : undefined}
                        decimals={2}
                      />
                      <ToolUI.Button variant="secondary" onClick={ai.unload}>
                        {t('取消准备', 'Cancel')}
                      </ToolUI.Button>
                    </>
                  ) : (
                    <ToolUI.Button
                      onClick={() => void ai.load()}
                      disabled={!capability.secure || !capability.webgpu || !ai.storageReady}
                    >
                      {t('开启助手', 'Start assistant')}
                      <ArrowUpRight size={15} />
                    </ToolUI.Button>
                  )}
                  {!capability.secure && (
                    <p role="alert">
                      {t(
                        '请通过 HTTPS 或 localhost 打开，以启用本地 AI。',
                        'Open over HTTPS or localhost to enable local AI.',
                      )}
                    </p>
                  )}
                  {!capability.webgpu && (
                    <p role="alert">
                      {t(
                        '当前浏览器无法开启助手，请使用开启硬件加速的新版 Chrome 或 Edge。',
                        'Use a recent Chrome or Edge with hardware acceleration enabled to start the assistant.',
                      )}
                    </p>
                  )}
                </div>
              )}
              {!noticeDismissed && (
                <div className="notice-box ai-storage-notice">
                  <ShieldCheck size={19} />
                  <p>
                    {t(
                      '聊天记录保存在本地，可以随时清空。切换页面后助手会继续工作，关闭助手后释放资源。',
                      'Conversations are saved locally and can be cleared anytime. The assistant keeps working as you browse; closing it releases resources.',
                    )}
                  </p>
                  <IconButton
                    aria-label={t('关闭本地聊天提示', 'Dismiss local chat notice')}
                    onClick={() => setNoticeDismissed(true)}
                  >
                    <X size={18} />
                  </IconButton>
                </div>
              )}
            </>
          }
          right={
            <>
              {ai.chat.length ? (
                <div
                  ref={transcript}
                  className="ai-transcript"
                  role="log"
                  aria-label={t('AI 对话记录', 'AI conversation')}
                  aria-live="polite"
                  onScroll={() => {
                    const el = transcript.current
                    if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90
                  }}
                >
                  {ai.chat.map((item) => (
                    <Message key={item.id} item={item} />
                  ))}
                  <div ref={end} />
                </div>
              ) : (
                <div className="ai-chat-empty">
                  <span className="big-sparkle">
                    <Sparkles size={40} strokeWidth={1.3} />
                  </span>
                  <h2>{t('今天，一起看看什么？', 'What would you like to explore?')}</h2>
                  <p>
                    {t(
                      '说出要求，我会推荐工具；附上文件，我会直接处理。',
                      'Describe a task to find tools, or attach files to process them.',
                    )}
                    <br />
                    {t('开启助手后，就可以开始。', 'Start when the assistant is ready.')}
                  </p>
                  <div className="ai-capability-chips">
                    <span>
                      <Eye size={13} />
                      {t('图片理解', 'Image understanding')}
                    </span>
                    <span>
                      <Unplug size={13} />
                      {t('工具调用', 'Tool calling')}
                    </span>
                    <span>
                      <ShieldCheck size={13} />
                      {t('本地运行', 'Local processing')}
                    </span>
                  </div>
                  <div className="prompt-suggestions">
                    {[
                      t('帮我描述这张图片', 'Describe this image'),
                      t('识别截图里的文字', 'Read the text in this screenshot'),
                      t('帮我整理这段内容', 'Help me organize this content'),
                      t('帮我选择合适的工具', 'Help me choose a tool'),
                    ].map((text) => (
                      <ToolUI.Button
                        key={text}
                        variant="secondary"
                        onClick={() => ai.setDraft(text)}
                      >
                        {text}
                        <ArrowUpRight size={14} />
                      </ToolUI.Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="ai-composer">
                <div className="ai-thinking-control">
                  <ToolUI.Select
                    label={t('思考强度', 'Thinking effort')}
                    value={ai.thinkingLevel}
                    onValueChange={(value) => {
                      if (
                        value === 'off' ||
                        value === 'low' ||
                        value === 'medium' ||
                        value === 'high'
                      )
                        ai.setThinkingLevel(value)
                    }}
                    disabled={busy}
                    options={[
                      { value: 'off', label: t('关闭思考', 'Off') },
                      { value: 'low', label: t('轻量', 'Low') },
                      { value: 'medium', label: t('标准', 'Medium') },
                      { value: 'high', label: t('深入', 'High') },
                    ]}
                  />
                  <p>
                    {t(
                      '越高会给模型更多思考时间，生成也会更慢。关闭后直接回答。',
                      'Higher effort gives the model more time to think and takes longer. Off answers directly.',
                    )}
                  </p>
                </div>
                {files.map((file, index) => (
                  <div className="image-attachment" key={`${file.name}-${index}`}>
                    {canPreview(file) && (
                      <LocalImage
                        blob={file}
                        alt={t('待识别图片的本地预览', 'Local preview of the image to analyze')}
                      />
                    )}
                    <span>
                      {file.name}
                      <small>{t('文件仅在本地读取', 'File read locally only')}</small>
                    </span>
                    <IconButton
                      aria-label={t('移除 {name}', 'Remove {name}', { name: file.name })}
                      onClick={() => ai.setAttachments(files.filter((_, i) => i !== index))}
                    >
                      <X size={15} />
                    </IconButton>
                  </div>
                ))}
                <div
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing &&
                      event.nativeEvent.keyCode !== 229
                    ) {
                      event.preventDefault()
                      send()
                    }
                  }}
                >
                  <ToolUI.TextArea
                    label={t('AI 对话内容', 'AI message')}
                    value={prompt}
                    onValueChange={ai.setDraft}
                    placeholder={t('输入要求，或附上文件…', 'Describe a task or attach files…')}
                    disabled={busy}
                  />
                </div>
                <div className="composer-actions">
                  <ToolUI.Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => input.current?.click()}
                    aria-label={t('添加文件', 'Add files')}
                  >
                    <Paperclip size={17} />
                    {t('添加文件', 'Add files')}
                  </ToolUI.Button>
                  <input
                    ref={input}
                    type="file"
                    multiple
                    aria-label={t('选择待处理文件', 'Choose files to process')}
                    hidden
                    onChange={(event) => {
                      const selected = [...(event.target.files ?? [])]
                      event.target.value = ''
                      setFileError('')
                      if (!selected.length) return
                      if (
                        [...files, ...selected].length > 20 ||
                        selected.some((file) => file.size > 200 * 1024 * 1024)
                      ) {
                        setFileError(
                          bilingual(
                            '最多添加 20 个文件，单个文件需小于 200 MB。',
                            'Attach up to 20 files, each smaller than 200 MB.',
                          ),
                        )
                        return
                      }
                      ai.setAttachments([...files, ...selected])
                    }}
                  />
                  <span>
                    <ShieldCheck size={13} />
                    {t('内容留在本地', 'Content stays local')}
                  </span>
                  {busy ? (
                    <ToolUI.Button variant="secondary" onClick={ai.stop}>
                      <Square size={14} />
                      {t('停止生成', 'Stop generating')}
                    </ToolUI.Button>
                  ) : (
                    <ToolUI.Button
                      disabled={!ready || !ai.storageReady || (!prompt.trim() && !files.length)}
                      onClick={send}
                    >
                      {t('发送', 'Send')}
                      <ArrowUpRight size={15} />
                    </ToolUI.Button>
                  )}
                </div>
                {(fileError || ai.error || ai.storageError) && (
                  <div role="alert" className="error-message">
                    {resolve(fileError || ai.error || ai.storageError)}
                  </div>
                )}
              </div>
              <div className="ai-session-actions">
                <span>
                  {t('Enter 发送 · Shift+Enter 换行', 'Enter to send · Shift+Enter for a new line')}
                </span>
                <ToolUI.Button
                  variant="secondary"
                  disabled={busy || loading || !ai.storageReady || !ai.chat.length}
                  onClick={ai.clear}
                >
                  <Trash2 size={13} />
                  {t('清空对话', 'Clear chat')}
                </ToolUI.Button>
              </div>
            </>
          }
        />
      </div>
    </>
  )
}
