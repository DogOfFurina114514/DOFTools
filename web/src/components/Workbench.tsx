import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  FileImage,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  X,
} from 'lucide-react'
import { Checkbox, NumberField, Select, Slider } from './controls'
import { MediaPreview } from './MediaPreview'
import { categoryOf, findTool, tools, type Tool } from '../data/tools'
import {
  countText,
  decodeBase64,
  downloadBlob,
  encodeBase64,
  formatBytes,
  formatJson,
  generateUuids,
  inspectVideo,
  minifyJson,
  transformImage,
} from '../lib/browser-tools'
import { useToolbox } from '../App'

function useObjectUrl(file: File | Blob | null) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!file) {
      setUrl('')
      return
    }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url
}

function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="error-message">
      {error}
    </div>
  ) : null
}
function PanelTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel-title">
      <h3>{children}</h3>
      {action}
    </div>
  )
}

function Dropzone({
  accept,
  onFile,
  disabled = false,
  kind = 'image',
}: {
  accept: string
  onFile: (file: File) => void
  disabled?: boolean
  kind?: 'image' | 'video'
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const drop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (!disabled && event.dataTransfer.files[0]) onFile(event.dataTransfer.files[0])
  }
  return (
    <div
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      <span className="upload-icon">
        <ImagePlus size={34} strokeWidth={1.4} />
      </span>
      <h3>把{kind === 'image' ? '图片' : '视频'}轻轻放到这里</h3>
      <p>拖拽文件，或者从你的电脑中选择</p>
      <button className="button primary" disabled={disabled} onClick={() => input.current?.click()}>
        <Upload size={16} /> 选择{kind === 'image' ? '图片' : '视频'}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        aria-label={`选择本地${kind === 'image' ? '图片' : '视频'}`}
        tabIndex={-1}
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          event.target.value = ''
        }}
      />
      <small>
        {kind === 'image'
          ? '支持 JPG、PNG、WebP 等浏览器可读取的图片 · 最大 50 MB'
          : '支持当前浏览器可播放的视频 · 推荐 MP4、WebM'}
      </small>
      <span className="dropzone-privacy">
        <LockKeyhole size={12} /> 文件仅在你的浏览器中处理
      </span>
    </div>
  )
}

function ImageTool({ tool }: { tool: Tool }) {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/webp')
  const [quality, setQuality] = useState(80)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [lockRatio, setLockRatio] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Awaited<ReturnType<typeof transformImage>> | null>(null)
  const fileUrl = useObjectUrl(file)
  const resultUrl = useObjectUrl(result?.blob ?? null)
  const { notify } = useToolbox()
  const selectFile = (next: File) => {
    setError('')
    setResult(null)
    if (!next.type.startsWith('image/')) {
      setError('请选择图片文件。')
      return
    }
    if (next.size > 50 * 1024 * 1024) {
      setError('当前支持 50 MB 以内的图片。')
      return
    }
    setFile(next)
  }
  const process = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      if (tool.id === 'image-resize' && !width && !height)
        throw new Error('请至少输入一个目标尺寸。')
      const next = await transformImage(file, {
        format,
        quality: quality / 100,
        width: tool.id === 'image-resize' && width ? Number(width) : undefined,
        height:
          tool.id === 'image-resize' && height && (!lockRatio || !width)
            ? Number(height)
            : undefined,
      })
      setResult(next)
      notify('图片处理好了，可以下载啦')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '处理失败，请重试。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="workspace-columns">
        <section className="workspace-panel input-panel">
          <PanelTitle
            action={
              file && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setFile(null)
                    setResult(null)
                    setError('')
                  }}
                >
                  <RotateCcw size={13} /> 重新选择
                </button>
              )
            }
          >
            原始图片
          </PanelTitle>
          {file ? (
            <div className="image-input-preview">
              <div className="checkerboard">
                <img src={fileUrl} alt="待处理的原始图片" />
              </div>
              <div className="file-details">
                <FileImage size={18} />
                <span>
                  {file.name}
                  <small>{formatBytes(file.size)}</small>
                </span>
              </div>
            </div>
          ) : (
            <Dropzone accept="image/*" onFile={selectFile} disabled={busy} />
          )}
        </section>
        <section className="workspace-panel options-panel">
          <PanelTitle>处理设置</PanelTitle>
          <div className="options-body">
            <Select
              label="导出格式"
              value={format}
              disabled={busy}
              onValueChange={(value) => setFormat(value as typeof format)}
              options={[
                { value: 'image/webp', label: 'WebP · 体积更轻巧' },
                { value: 'image/jpeg', label: 'JPG · 兼容性更好' },
                { value: 'image/png', label: 'PNG · 保留透明背景' },
              ]}
            />
            {tool.id === 'image-resize' && (
              <>
                <div className="dimension-fields">
                  <NumberField
                    label="目标宽度"
                    min={1}
                    max={16384}
                    value={width === '' ? '' : Number(width)}
                    onValueChange={(value) => setWidth(String(value))}
                    placeholder="自动"
                    disabled={busy}
                  />
                  <span>×</span>
                  <NumberField
                    label="目标高度"
                    min={1}
                    max={16384}
                    value={height === '' ? '' : Number(height)}
                    onValueChange={(value) => setHeight(String(value))}
                    placeholder="自动"
                    disabled={busy || (lockRatio && !!width)}
                  />
                </div>
                <Checkbox
                  label="保持原始比例"
                  value={lockRatio}
                  onValueChange={setLockRatio}
                  disabled={busy}
                />
                <p className="field-hint">保持比例时以宽度为准；只填写高度也可以。</p>
              </>
            )}
            {format !== 'image/png' && (
              <Slider
                label="图片质量"
                min={10}
                max={100}
                value={quality}
                disabled={busy}
                onValueChange={setQuality}
                help="更小体积 / 更清晰画质"
              />
            )}
            <p className="field-hint">
              {format === 'image/png'
                ? 'PNG 使用无损编码，体积可能大于原图。'
                : format === 'image/jpeg'
                  ? '透明背景会填充为白色。'
                  : 'WebP 在清晰度与体积之间取得更好的平衡。'}
              {file?.type === 'image/gif' ? ' 动图将导出为一张静态图片。' : ''}
            </p>
            <ErrorMessage error={error} />
            <button
              className="button primary full-width"
              disabled={!file || busy}
              onClick={process}
            >
              {busy ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}
              {busy
                ? '正在本地处理…'
                : tool.id === 'image-compress'
                  ? '开始压缩'
                  : tool.id === 'image-resize'
                    ? '调整尺寸'
                    : '转换格式'}
            </button>
            <span className="processing-note">
              <ShieldCheck size={13} /> 处理过程无需联网
            </span>
          </div>
        </section>
      </div>
      {result && (
        <section className="workspace-panel result-panel">
          <PanelTitle
            action={
              <span className="success-badge">
                <Check size={13} /> 已完成
              </span>
            }
          >
            处理结果
          </PanelTitle>
          <div className="image-result">
            <div className="result-thumbnail checkerboard">
              <img src={resultUrl} alt="处理后的图片预览" />
            </div>
            <div className="result-summary">
              <h3>{result.filename}</h3>
              <p>
                {result.width} × {result.height} px · {formatBytes(result.blob.size)}
              </p>
              <span
                className={result.blob.size < result.originalSize ? 'green-text' : 'muted-text'}
              >
                {result.blob.size < result.originalSize
                  ? `体积减少 ${(100 * (1 - result.blob.size / result.originalSize)).toFixed(1)}%`
                  : '导出文件比原图更大，可尝试 WebP 或降低质量。'}
              </span>
            </div>
            <button
              className="button primary"
              onClick={() => downloadBlob(result.blob, result.filename)}
            >
              <Download size={16} /> 下载图片
            </button>
          </div>
        </section>
      )}
    </>
  )
}

function TextStats() {
  const [text, setText] = useState('')
  const stats = countText(text)
  return (
    <>
      <div className="stats-grid">
        {Object.entries({
          总字符: stats.characters,
          不含空白: stats.charactersWithoutSpaces,
          '词数 / 汉字': stats.words,
          行数: stats.lines,
          段落: stats.paragraphs,
        }).map(([label, value]) => (
          <div className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value.toLocaleString()}</strong>
          </div>
        ))}
      </div>
      <section className="workspace-panel">
        <PanelTitle
          action={
            <button className="text-button" onClick={() => setText('')} disabled={!text}>
              <X size={13} /> 清空
            </button>
          }
        >
          输入文本 · 即时统计
        </PanelTitle>
        <textarea
          className="tool-textarea large-textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="写一点文字，或把内容粘贴到这里…"
          aria-label="要统计的文本"
        />
      </section>
      <p className="field-hint">
        汉字按单字计数，英文按词计数；空行分隔段落，表情按 Unicode 字符计数。
      </p>
    </>
  )
}

function TextTransformer({ kind }: { kind: 'json' | 'base64' | 'url' }) {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [mode, setMode] = useState<'primary' | 'secondary'>('primary')
  const [error, setError] = useState('')
  const { notify } = useToolbox()
  const labels = kind === 'json' ? ['格式化', '压缩'] : ['编码', '解码']
  const process = () => {
    setError('')
    setOutput('')
    try {
      setOutput(
        kind === 'json'
          ? mode === 'primary'
            ? formatJson(input)
            : minifyJson(input)
          : kind === 'base64'
            ? mode === 'primary'
              ? encodeBase64(input)
              : decodeBase64(input)
            : mode === 'primary'
              ? encodeURIComponent(input)
              : decodeURIComponent(input),
      )
      notify('处理完成')
    } catch (reason) {
      setError(
        kind === 'json'
          ? `JSON 格式有误：${reason instanceof Error ? reason.message : '请检查输入。'}`
          : '无法处理输入，请检查编码是否有效。',
      )
    }
  }
  const example = () => {
    setInput(
      kind === 'json'
        ? '{"name":"芙芙的狗工具箱","local":true,"tools":["图片","视频","文档","其他"]}'
        : kind === 'base64'
          ? mode === 'primary'
            ? '你好，芙芙！🐶'
            : encodeBase64('你好，芙芙！🐶')
          : mode === 'primary'
            ? '你好，芙芙 & tools=图片'
            : encodeURIComponent('你好，芙芙 & tools=图片'),
    )
    setOutput('')
    setError('')
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output)
      notify('已复制到剪贴板')
    } catch {
      notify('无法访问剪贴板，请手动选择并复制。')
    }
  }
  return (
    <>
      <div className="workbench-toolbar">
        <div className="segmented-control">
          {labels.map((label, index) => (
            <button
              key={label}
              className={mode === (index ? 'secondary' : 'primary') ? 'active' : ''}
              onClick={() => {
                setMode(index ? 'secondary' : 'primary')
                setOutput('')
                setError('')
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="text-button" onClick={example}>
          填入示例 <Sparkles size={14} />
        </button>
      </div>
      <div className="workspace-columns equal">
        <section className="workspace-panel">
          <PanelTitle
            action={
              <button
                className="text-button"
                disabled={!input}
                onClick={() => {
                  setInput('')
                  setOutput('')
                  setError('')
                }}
              >
                清空
              </button>
            }
          >
            输入内容
          </PanelTitle>
          <textarea
            className="tool-textarea mono"
            aria-label="输入内容"
            placeholder={kind === 'json' ? '在这里粘贴 JSON 内容…' : '在这里粘贴需要处理的文本…'}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
          />
        </section>
        <section className="workspace-panel">
          <PanelTitle
            action={
              <button className="text-button" disabled={!output} onClick={copy}>
                <Copy size={13} /> 复制
              </button>
            }
          >
            处理结果
          </PanelTitle>
          <textarea
            className="tool-textarea mono output-area"
            aria-label="处理结果"
            placeholder="处理后的内容会出现在这里"
            value={output}
            readOnly
            spellCheck={false}
          />
        </section>
      </div>
      <ErrorMessage error={error} />
      <div className="workbench-action-row">
        <button className="button primary" disabled={!input} onClick={process}>
          <Sparkles size={16} />
          {labels[mode === 'primary' ? 0 : 1]}内容 <ArrowRight size={16} />
        </button>
        <span>
          <ShieldCheck size={14} /> 文本仅在本地处理
        </span>
        {output && (
          <button
            className="button secondary"
            onClick={() =>
              downloadBlob(
                new Blob([output], {
                  type: kind === 'json' ? 'application/json' : 'text/plain;charset=utf-8',
                }),
                kind === 'json' ? 'fufu-result.json' : 'fufu-result.txt',
              )
            }
          >
            <Download size={15} /> 下载结果
          </button>
        )}
      </div>
    </>
  )
}

function UuidTool() {
  const [count, setCount] = useState('5')
  const [values, setValues] = useState<string[]>([])
  const [error, setError] = useState('')
  const { notify } = useToolbox()
  return (
    <div className="workspace-columns">
      <section className="workspace-panel">
        <PanelTitle>生成设置</PanelTitle>
        <div className="options-body">
          <NumberField
            label="生成数量"
            min={1}
            max={100}
            value={count === '' ? '' : Number(count)}
            onValueChange={(value) => setCount(String(value))}
          />
          <p className="field-hint">生成标准 UUID v4，一次最多 100 个。使用浏览器安全随机数。</p>
          <ErrorMessage error={error} />
          <button
            className="button primary full-width"
            onClick={() => {
              try {
                setValues(generateUuids(Number(count)))
                setError('')
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : '生成失败。')
              }
            }}
          >
            <Sparkles size={16} /> 生成 UUID
          </button>
        </div>
      </section>
      <section className="workspace-panel">
        <PanelTitle
          action={
            <button
              className="text-button"
              disabled={!values.length}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(values.join('\n'))
                  notify('已复制全部 UUID')
                } catch {
                  notify('请手动选择并复制结果。')
                }
              }}
            >
              <Copy size={13} /> 复制全部
            </button>
          }
        >
          你的唯一标识
        </PanelTitle>
        <textarea
          className="tool-textarea mono"
          value={values.join('\n')}
          readOnly
          aria-label="UUID 结果"
          placeholder="生成的 UUID 会在这里排好队…"
        />
      </section>
    </div>
  )
}

function ColorTool() {
  const [hex, setHex] = useState('#527A58')
  const { notify } = useToolbox()
  const valid = /^#?(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)
  const raw = hex.replace('#', '')
  const normalized = valid
    ? `#${(raw.length === 3
        ? raw
            .split('')
            .map((char) => char + char)
            .join('')
        : raw
      ).toUpperCase()}`
    : '#527A58'
  const rgb = [1, 3, 5].map((index) => parseInt(normalized.slice(index, index + 2), 16))
  return (
    <div className="workspace-columns">
      <section className="workspace-panel">
        <PanelTitle>选择一个颜色</PanelTitle>
        <div className="options-body">
          <div className="color-preview" style={{ background: normalized }}>
            <span>调整 RGB 滑块选择颜色</span>
          </div>
          {['红色', '绿色', '蓝色'].map((label, channel) => (
            <Slider
              key={label}
              label={label}
              value={rgb[channel]}
              min={0}
              max={255}
              onValueChange={(value) => {
                const next = [...rgb]
                next[channel] = value
                setHex(`#${next.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`)
              }}
            />
          ))}
          <label className="field-label">
            HEX 色值
            <input
              value={hex}
              onChange={(event) => setHex(event.target.value)}
              placeholder="#527A58"
            />
          </label>
          <ErrorMessage error={valid ? '' : '请输入 3 位或 6 位十六进制色值，例如 #527A58。'} />
        </div>
      </section>
      <section className="workspace-panel">
        <PanelTitle>颜色的另一种表达</PanelTitle>
        <div className="color-values">
          {[
            ['HEX', normalized],
            ['RGB', `rgb(${rgb.join(', ')})`],
            ['RGB 数值', rgb.join(', ')],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{valid ? value : '—'}</strong>
              <button
                className="icon-button"
                disabled={!valid}
                aria-label={`复制 ${label}`}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(value)
                    notify(`已复制 ${label}`)
                  } catch {
                    notify('请手动复制色值。')
                  }
                }}
              >
                <Copy size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function VideoInfoTool() {
  const [file, setFile] = useState<File | null>(null)
  const [info, setInfo] = useState<Awaited<ReturnType<typeof inspectVideo>> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const url = useObjectUrl(file)
  const select = async (next: File) => {
    if (!next.type.startsWith('video/')) {
      setError('请选择视频文件。')
      return
    }
    setBusy(true)
    setError('')
    setInfo(null)
    setFile(next)
    try {
      setInfo(await inspectVideo(next))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取视频。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <section className="workspace-panel">
        <PanelTitle
          action={
            file && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setFile(null)
                  setInfo(null)
                  setError('')
                }}
              >
                <RotateCcw size={13} /> 重新选择
              </button>
            )
          }
        >
          视频预览
        </PanelTitle>
        {file ? (
          <div className="video-preview">
            <MediaPreview src={url} />
            <span>{file.name}</span>
          </div>
        ) : (
          <Dropzone accept="video/*" onFile={select} kind="video" disabled={busy} />
        )}
      </section>
      {busy && (
        <p className="loading-line">
          <LoaderCircle size={17} className="spin" /> 正在读取视频信息…
        </p>
      )}
      <ErrorMessage error={error} />
      {info && (
        <div className="stats-grid video-stats">
          {[
            ['时长', `${Math.floor(info.duration / 60)} 分 ${(info.duration % 60).toFixed(1)} 秒`],
            ['分辨率', `${info.width} × ${info.height}`],
            ['文件大小', formatBytes(info.size)],
            ['文件类型', info.type || '未知'],
          ].map(([label, value]) => (
            <div className="stat-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function PlannedTool({ tool }: { tool: Tool }) {
  const related = tools.filter((item) => item.category === tool.category && item.kind !== 'planned')
  return (
    <section className="planned-workspace">
      <span className={`tool-icon extra-large ${categoryOf(tool.category).color}`}>
        <tool.icon size={36} strokeWidth={1.5} />
      </span>
      <span className="eyebrow">A LITTLE SOMETHING IS ON THE WAY</span>
      <h2>这个小工具，正在准备中。</h2>
      <p>
        {tool.name}的入口已经就位。
        <br />
        我们会在后续版本接入完整的本地处理能力。
      </p>
      <span className="planned-privacy">
        <ShieldCheck size={15} /> 依然会是纯前端，无需上传文件
      </span>
      {related.length > 0 && (
        <div className="related-tools">
          <span>先试试这些已经准备好的工具</span>
          {related.slice(0, 3).map((item) => (
            <Link className="button secondary" to={`/tool/${item.id}`} key={item.id}>
              <item.icon size={16} />
              {item.name}
              <ArrowRight size={14} />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function ToolWorkspace({ tool }: { tool: Tool }) {
  const { favorites, toggleFavorite, recordUsage } = useToolbox()
  useEffect(() => {
    recordUsage(tool.id)
  }, [tool.id])
  return (
    <>
      <Link to={`/category/${tool.category}`} className="back-link">
        <ArrowLeft size={15} /> 返回{categoryOf(tool.category).label['zh-CN']}
      </Link>
      <div className="page-heading workbench-heading">
        <div className="workbench-heading-main">
          <span className={`tool-icon large ${categoryOf(tool.category).color}`}>
            <tool.icon size={28} strokeWidth={1.6} />
          </span>
          <div>
            <span className="eyebrow">{categoryOf(tool.category).english} TOOL</span>
            <h1>
              {tool.name}
              <span className="heading-dot">.</span>
            </h1>
            <p>{tool.description}，在你的浏览器里轻松完成。</p>
          </div>
        </div>
        <button
          className={`button secondary ${favorites.includes(tool.id) ? 'favorited' : ''}`}
          onClick={() => toggleFavorite(tool.id)}
        >
          <Star size={16} fill={favorites.includes(tool.id) ? 'currentColor' : 'none'} />
          {favorites.includes(tool.id) ? '已收藏' : '收藏工具'}
        </button>
      </div>
      {tool.kind === 'planned' ? (
        <PlannedTool tool={tool} />
      ) : tool.kind === 'image' ? (
        <ImageTool tool={tool} />
      ) : tool.kind === 'text' ? (
        <TextStats />
      ) : tool.kind === 'json' || tool.kind === 'base64' || tool.kind === 'url' ? (
        <TextTransformer kind={tool.kind} />
      ) : tool.kind === 'uuid' ? (
        <UuidTool />
      ) : tool.kind === 'color' ? (
        <ColorTool />
      ) : (
        <VideoInfoTool />
      )}
      <div className="workbench-bottom-note">
        <ShieldCheck size={16} />
        <span>本地处理，无需上传。关闭页面后，文件内容会从内存中释放。</span>
      </div>
    </>
  )
}

export function Workbench() {
  const { id } = useParams()
  const tool = findTool(id)
  return tool ? (
    <ToolWorkspace key={tool.id} tool={tool} />
  ) : (
    <div className="empty-state">
      <h2>没有找到这个工具</h2>
      <Link to="/" className="button primary">
        返回工具箱 <ArrowRight size={16} />
      </Link>
    </div>
  )
}
