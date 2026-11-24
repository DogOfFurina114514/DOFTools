import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { BrowserLocalAI } from './ai-client'
import { visibleAIText } from './ai-output'
import { isAIThinkingLevel, type AIThinkingLevel } from './ai-thinking'
import { useStoredState } from './storage'
import {
  detectAICapability,
  type AIContentPart,
  type AIMessage,
  type LocalAIAdapter,
  type AILoadStage,
} from './ai'
import {
  assistantCatalog,
  assistantDefinitions,
  attachmentId,
  executeAssistantCall,
  type AssistantToolCard,
} from './assistant-tools'
import { readConversation, saveConversation } from './chat-storage'
import { settleAIHistory } from './ai-history'
import { useLocale } from './i18n'
import {
  bilingual,
  errorMessage,
  localize,
  LocalizedError,
  type DisplayText,
  type Locale,
} from './locale'

export interface ChatItem {
  id: string
  role: 'user' | 'assistant' | 'tool'
  text: DisplayText
  image?: Blob
  attachments?: File[]
  tools?: AssistantToolCard[]
  outputs?: { name: string; blob: Blob }[]
  progress?: number
  pending?: boolean
  thinking?: boolean
  interrupted?: boolean
  tokens?: number
  elapsed?: number
}
type AIStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error'
interface AISession {
  status: AIStatus
  progress: number
  loadStage: AILoadStage
  error: DisplayText
  chat: ChatItem[]
  load: () => Promise<void>
  send: (text: string, files?: File[]) => Promise<void>
  thinkingLevel: AIThinkingLevel
  setThinkingLevel: (level: AIThinkingLevel) => void
  draft: string
  setDraft: (value: string) => void
  attachments: File[]
  setAttachments: (files: File[]) => void
  storageReady: boolean
  storageError: DisplayText
  stop: () => void
  unload: () => void
  clear: () => void
}
const Context = createContext<AISession>(null!)
export const useLocalAI = () => useContext(Context)
const system = (locale: Locale): AIMessage => ({
  role: 'system',
  content: localize(
    locale,
    bilingual(
      '你是芙芙的狗工具箱的助手。用中文简明回答，可以理解图片。用户仅用文字提出工具需求时，调用 show_tools 展示工具，不执行。用户本次上传待处理文件且提出处理要求时，调用 run_tool 直接执行并返回真实结果。图片描述问题直接回答即可。只使用目录中已注册的工具；工具为空就说明暂没有合适的工具。根据真实结果回答，不能编造文件、下载链接或工具执行。附件 ID 仅限当前消息，不可处理以前的附件。',
      'You are the assistant of DogOfFurina Toolbox. Reply concisely in English and understand images. For text-only tool requests, call show_tools to recommend tools without executing. When the user uploads files in this turn with processing instructions, call run_tool and return actual results. Answer image-description questions directly. Use only registered tools in the catalog; when none fit, say so. Never invent execution, files or download links. Attachment IDs refer only to the current message, never earlier attachments.',
    ),
  ),
})

export function AISessionProvider({
  children,
  createAdapter = () => new BrowserLocalAI(),
}: {
  children: ReactNode
  createAdapter?: () => LocalAIAdapter
}) {
  const { locale, t } = useLocale()
  const [thinkingLevel, setThinkingLevel] = useStoredState<AIThinkingLevel>(
    'ai-thinking',
    'off',
    isAIThinkingLevel,
  )
  const adapter = useRef<LocalAIAdapter | null>(null)
  const history = useRef<AIMessage[]>([system(locale)])
  const generation = useRef(0)
  const active = useRef(false)
  const stopped = useRef(false)
  const toolAbort = useRef<AbortController | null>(null)
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState<AIStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [loadStage, setLoadStage] = useState<AILoadStage>('starting')
  const [error, setError] = useState<DisplayText>('')
  const [chat, setChat] = useState<ChatItem[]>([])
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [storageReady, setStorageReady] = useState(false)
  const [storageError, setStorageError] = useState<DisplayText>('')
  useEffect(() => {
    let alive = true
    void readConversation()
      .then((saved) => {
        if (!alive) return
        if (saved) {
          history.current = settleAIHistory(saved.messages)
          setChat(
            saved.chat.map((item) =>
              item.pending ? { ...item, pending: false, interrupted: true } : item,
            ),
          )
        }
      })
      .catch(() => {
        if (alive)
          setStorageError(
            bilingual('无法读取本地聊天记录。', 'Could not read the local conversation.'),
          )
      })
      .finally(() => {
        if (alive) setStorageReady(true)
      })
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    if (!storageReady) return
    const persist = () => {
      void saveConversation(chat, history.current).catch(() =>
        setStorageError(
          bilingual(
            '聊天记录未能保存，请检查浏览器存储空间。',
            'The conversation could not be saved. Check browser storage space.',
          ),
        ),
      )
    }
    if (!chat.some((item) => item.pending)) {
      persist()
      return
    }
    const timer = setTimeout(persist, 300)
    return () => clearTimeout(timer)
  }, [chat, storageReady])
  useEffect(() => {
    setStatus('idle')
    setProgress(0)
    setChat((items) =>
      items.map((item) => (item.pending ? { ...item, pending: false, interrupted: true } : item)),
    )
    return () => {
      generation.current++
      if (stopTimer.current) clearTimeout(stopTimer.current)
      toolAbort.current?.abort()
      void adapter.current?.dispose()
      adapter.current = null
      active.current = false
    }
  }, [])
  const patch = (id: string, values: Partial<ChatItem>) =>
    setChat((items) => items.map((item) => (item.id === id ? { ...item, ...values } : item)))
  const unload = () => {
    if (stopTimer.current) clearTimeout(stopTimer.current)
    stopTimer.current = null
    generation.current++
    history.current = settleAIHistory(history.current)
    toolAbort.current?.abort()
    void adapter.current?.dispose()
    adapter.current = null
    active.current = false
    setChat((items) =>
      items.map((item) => (item.pending ? { ...item, pending: false, interrupted: true } : item)),
    )
    setStatus('idle')
    setProgress(0)
    setError('')
  }
  useEffect(() => {
    window.addEventListener('model-resources-clearing', unload)
    return () => window.removeEventListener('model-resources-clearing', unload)
  }, [])
  const load = async () => {
    if (!detectAICapability().desktop) return
    if (active.current || status === 'ready') return
    active.current = true
    const token = ++generation.current
    setStatus('loading')
    setLoadStage('starting')
    setError('')
    setProgress(0)
    adapter.current = createAdapter()
    try {
      await adapter.current.load(
        (value) => {
          if (token === generation.current) setProgress(value)
        },
        undefined,
        (stage) => {
          if (token === generation.current) setLoadStage(stage)
        },
      )
      if (token === generation.current) {
        setProgress(1)
        setStatus('ready')
      }
    } catch (error) {
      if (token === generation.current) {
        setError(errorMessage(error))
        setStatus('error')
        void adapter.current?.dispose()
        adapter.current = null
      }
    } finally {
      if (token === generation.current) active.current = false
    }
  }
  const stop = () => {
    if (status !== 'generating' || stopTimer.current) return
    stopped.current = true
    toolAbort.current?.abort()
    adapter.current?.interrupt()
    const token = generation.current
    // A native GPU prefill can block the worker's event loop. Bound cancellation
    // latency by releasing that worker if cooperative interruption cannot finish.
    stopTimer.current = setTimeout(() => {
      if (token === generation.current && active.current) unload()
    }, 2000)
  }
  const send = async (text: string, files: File[] = []) => {
    if (
      !storageReady ||
      status !== 'ready' ||
      active.current ||
      !adapter.current ||
      (!text.trim() && !files.length)
    )
      return
    active.current = true
    stopped.current = false
    const requestedThinking = thinkingLevel
    const token = generation.current
    const image = files.find(
      (file) =>
        ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) &&
        file.size <= 10 * 1024 * 1024,
    )
    const userText =
      text.trim() ||
      (image
        ? t('请描述这张图片。', 'Please describe this image.')
        : t('请帮我选择适合处理这些文件的工具。', 'Please find tools for these files.'))
    const attachmentInfo = files.length
      ? '\n' +
        JSON.stringify(
          files.map((file, index) => ({
            id: attachmentId(index),
            name: file.name,
            type: file.type,
            bytes: file.size,
          })),
        )
      : ''
    const content: string | AIContentPart[] = image
      ? [
          { type: 'image', image },
          {
            type: 'text',
            text: userText + attachmentInfo,
          },
        ]
      : userText + attachmentInfo
    const user: AIMessage = { role: 'user', content }
    const instruction = system(locale)
    instruction.content +=
      '\nTool catalog: ' + JSON.stringify(assistantCatalog(locale, undefined, files))
    instruction.content += files.length
      ? '\nCurrent attachments may be processed when requested.'
      : '\nNo files attached in this turn. Only recommend tools; do not execute.'
    const messages = [instruction, ...history.current.slice(1), user]
    history.current = messages
    const userItem: ChatItem = {
      id: crypto.randomUUID(),
      role: 'user',
      text: userText,
      image,
      attachments: files,
    }
    let answerId = crypto.randomUUID()
    setChat((items) => [
      ...items,
      userItem,
      {
        id: answerId,
        role: 'assistant',
        text: '',
        pending: true,
        thinking: requestedThinking !== 'off',
      },
    ])
    setStatus('generating')
    setError('')
    const abort = new AbortController()
    toolAbort.current = abort
    try {
      const tools = assistantDefinitions(locale, files)
      const completedCalls = new Map<string, Awaited<ReturnType<typeof executeAssistantCall>>>()
      for (let round = 0; round < 4; round++) {
        let raw = requestedThinking === 'off' ? '' : '<think>\n'
        const response = await adapter.current.generate({
          messages,
          tools,
          thinkingLevel: requestedThinking,
          onToken: (text) => {
            raw += text
            if (token === generation.current && !stopped.current)
              patch(answerId, {
                text: visibleAIText(raw),
                thinking: requestedThinking !== 'off' && !raw.includes('</think>'),
              })
          },
          onToolCall: () => {},
        })
        if (token !== generation.current) return
        patch(answerId, {
          text:
            response.text ||
            (response.toolCalls.length ? bilingual('正在连接工具…', 'Connecting tools…') : ''),
          pending: false,
          thinking: false,
          interrupted: response.interrupted || stopped.current,
          tokens: response.tokens,
          elapsed: response.elapsed,
        })
        messages.push({ role: 'assistant', content: response.text, toolCalls: response.toolCalls })
        if (response.interrupted || stopped.current || !response.toolCalls.length) break
        if (round === 3)
          throw new LocalizedError(
            '工具调用轮数已达到上限。',
            'The tool calling round limit was reached.',
          )
        let successful = true
        let processedFiles = false
        for (const call of response.toolCalls) {
          abort.signal.throwIfAborted()
          const id = crypto.randomUUID()
          setChat((items) => [
            ...items,
            {
              id,
              role: 'tool',
              text: bilingual('正在准备工具…', 'Preparing the tool…'),
              pending: true,
            },
          ])
          try {
            const key = JSON.stringify([call.name, call.arguments])
            const result =
              completedCalls.get(key) ??
              (await executeAssistantCall(call, files, {
                locale,
                signal: abort.signal,
                onProgress: (value) => {
                  if (token === generation.current && !abort.signal.aborted)
                    patch(id, { progress: Math.max(0, Math.min(1, value)) })
                },
              }))
            if (token !== generation.current) return
            completedCalls.set(key, result)
            processedFiles ||= call.name === 'run_tool' && files.length > 0
            const content = result.content
            patch(id, {
              text: result.summary,
              tools: result.cards,
              outputs: result.files,
              pending: false,
              progress: undefined,
            })
            messages.push({ role: 'tool', toolCallId: call.id, content })
          } catch (error) {
            successful = false
            if (token !== generation.current) return
            const message = errorMessage(error)
            patch(id, { text: message, pending: false })
            messages.push({
              role: 'tool',
              toolCallId: call.id,
              content: JSON.stringify({ error: localize(locale, message) }),
            })
            if (stopped.current) break
          }
        }
        if (stopped.current) break
        // Cards and outputs already contain the real result. Finish immediately
        // instead of asking a small local model to repeat it in a second pass.
        if (successful) {
          patch(answerId, {
            text: processedFiles
              ? bilingual('处理已完成，结果见下方。', 'Processing is complete. Results are below.')
              : bilingual(
                  '工具已列在下方，点击即可打开。',
                  'Tools are listed below. Select one to open it.',
                ),
          })
          break
        }
        answerId = crypto.randomUUID()
        setChat((items) => [
          ...items,
          {
            id: answerId,
            role: 'assistant',
            text: '',
            pending: true,
            thinking: requestedThinking !== 'off',
          },
        ])
      }
      history.current = settleAIHistory(messages)
    } catch (error) {
      if (token === generation.current) {
        patch(answerId, { pending: false, thinking: false, interrupted: stopped.current })
        if (!stopped.current) setError(errorMessage(error))
        // Keep only complete model turns; a failed user turn can be edited and retried.
        if (messages.at(-1)?.role === 'assistant' && !messages.at(-1)?.content) messages.pop()
        history.current = settleAIHistory(messages)
      }
    } finally {
      if (token === generation.current) {
        if (stopTimer.current) clearTimeout(stopTimer.current)
        stopTimer.current = null
        active.current = false
        setStatus('ready')
      }
    }
  }
  const clear = () => {
    if (!active.current && storageReady) {
      history.current = [system(locale)]
      setChat([])
      setError('')
      setStorageError('')
    }
  }
  return (
    <Context.Provider
      value={{
        status,
        progress,
        loadStage,
        error,
        chat,
        load,
        send,
        thinkingLevel,
        setThinkingLevel,
        stop,
        unload,
        clear,
        draft,
        setDraft,
        attachments,
        setAttachments,
        storageReady,
        storageError,
      }}
    >
      {children}
    </Context.Provider>
  )
}
