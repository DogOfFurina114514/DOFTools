import {
  Image,
  Video,
  FileText,
  Shapes,
  Minimize2,
  RefreshCw,
  Scaling,
  Crop,
  Palette,
  Film,
  Volume2,
  Scissors,
  FileVideo,
  Captions,
  Files,
  FileOutput,
  FileInput,
  LetterText,
  FileSearch,
  Braces,
  Binary,
  Fingerprint,
  Pipette,
  Link,
  type LucideIcon,
} from 'lucide-react'
import { bilingual, type LocalizedText } from '../lib/locale'

export type CategoryId = 'image' | 'video' | 'audio' | 'document' | 'other'
export type ToolKind =
  'image' | 'video-info' | 'text' | 'json' | 'base64' | 'uuid' | 'color' | 'url' | 'planned'

export const categories: {
  id: CategoryId
  label: LocalizedText
  english: string
  description: LocalizedText
  icon: LucideIcon
  color: string
}[] = [
  {
    id: 'image',
    label: bilingual('图片工具', 'Image tools'),
    english: 'IMAGE',
    description: bilingual('让每一张图片，恰到好处。', 'Make every image just right.'),
    icon: Image,
    color: 'green',
  },
  {
    id: 'video',
    label: bilingual('视频工具', 'Video tools'),
    english: 'VIDEO',
    description: bilingual(
      '关于影像的小事，在这里轻松处理。',
      'Handle the small tasks behind your videos.',
    ),
    icon: Video,
    color: 'purple',
  },
  {
    id: 'audio',
    label: bilingual('音频工具', 'Audio tools'),
    english: 'AUDIO',
    description: bilingual(
      '把声音里的灵感，好好留下。',
      'Make room for the sounds that inspire you.',
    ),
    icon: Volume2,
    color: 'blue',
  },
  {
    id: 'document',
    label: bilingual('文档工具', 'Document tools'),
    english: 'DOCUMENT',
    description: bilingual(
      '整理文字与文件，让工作井井有条。',
      'Keep your text and documents in order.',
    ),
    icon: FileText,
    color: 'orange',
  },
  {
    id: 'other',
    label: bilingual('其他工具', 'Other tools'),
    english: 'EVERYDAY',
    description: bilingual(
      '那些偶尔需要，却总能帮上忙的小工具。',
      'Small utilities for everyday tasks.',
    ),
    icon: Shapes,
    color: 'blue',
  },
]

export interface Tool {
  id: string
  name: string
  description: string
  category: CategoryId
  icon: LucideIcon
  kind: ToolKind
  tags: string[]
  featured?: boolean
  badge?: string
}

// Draft implementations are kept for later; no tools are enabled in this framework release.
export const tools: Tool[] = []
export const toolDrafts: Tool[] = [
  {
    id: 'image-compress',
    name: '图片压缩',
    description: '减小图片体积，让分享更轻盈',
    category: 'image',
    icon: Minimize2,
    kind: 'image',
    tags: ['JPG', 'WEBP'],
    featured: true,
    badge: '常用',
  },
  {
    id: 'image-convert',
    name: '图片格式转换',
    description: 'JPG、PNG、WebP，轻松转换',
    category: 'image',
    icon: RefreshCw,
    kind: 'image',
    tags: ['JPG', 'PNG', 'WEBP'],
    featured: true,
  },
  {
    id: 'image-resize',
    name: '图片尺寸调整',
    description: '调整宽高，找到合适的尺寸',
    category: 'image',
    icon: Scaling,
    kind: 'image',
    tags: ['缩放', '尺寸'],
    featured: true,
  },
  {
    id: 'image-crop',
    name: '图片裁剪',
    description: '留下画面里最喜欢的部分',
    category: 'image',
    icon: Crop,
    kind: 'planned',
    tags: ['裁剪', '比例'],
  },
  {
    id: 'image-palette',
    name: '图片取色',
    description: '从图片中发现好看的颜色',
    category: 'image',
    icon: Palette,
    kind: 'planned',
    tags: ['取色', '调色板'],
  },
  {
    id: 'video-info',
    name: '视频信息',
    description: '查看视频时长、分辨率与大小',
    category: 'video',
    icon: FileVideo,
    kind: 'video-info',
    tags: ['MP4', 'WEBM'],
    featured: true,
  },
  {
    id: 'video-convert',
    name: '视频格式转换',
    description: '为你的影片换一个合适的格式',
    category: 'video',
    icon: Film,
    kind: 'planned',
    tags: ['MP4', 'WEBM'],
  },
  {
    id: 'video-audio',
    name: '音频提取',
    description: '把喜欢的声音单独留下来',
    category: 'video',
    icon: Volume2,
    kind: 'planned',
    tags: ['音频', '提取'],
  },
  {
    id: 'video-trim',
    name: '视频剪辑',
    description: '截取片段，保留精彩时刻',
    category: 'video',
    icon: Scissors,
    kind: 'planned',
    tags: ['剪辑', '片段'],
  },
  {
    id: 'video-subtitles',
    name: '字幕工具',
    description: '编辑字幕，让表达更清晰',
    category: 'video',
    icon: Captions,
    kind: 'planned',
    tags: ['SRT', '字幕'],
  },
  {
    id: 'pdf-merge',
    name: 'PDF 合并',
    description: '多个文件，整理成一份文档',
    category: 'document',
    icon: Files,
    kind: 'planned',
    tags: ['PDF', '合并'],
    featured: true,
  },
  {
    id: 'pdf-split',
    name: 'PDF 拆分',
    description: '按需提取你想要的页面',
    category: 'document',
    icon: FileOutput,
    kind: 'planned',
    tags: ['PDF', '拆分'],
  },
  {
    id: 'pdf-images',
    name: '图片转 PDF',
    description: '把图片装订成一份轻巧文档',
    category: 'document',
    icon: FileInput,
    kind: 'planned',
    tags: ['图片', 'PDF'],
  },
  {
    id: 'text-stats',
    name: '文本统计',
    description: '字数、词数、段落，一目了然',
    category: 'document',
    icon: LetterText,
    kind: 'text',
    tags: ['字数', '文本'],
    featured: true,
  },
  {
    id: 'document-ocr',
    name: '文字识别',
    description: '让图片里的文字变得可编辑',
    category: 'document',
    icon: FileSearch,
    kind: 'planned',
    tags: ['OCR', '文字'],
  },
  {
    id: 'json-format',
    name: 'JSON 格式化',
    description: '让数据整整齐齐，更易阅读',
    category: 'other',
    icon: Braces,
    kind: 'json',
    tags: ['JSON', '开发'],
    featured: true,
  },
  {
    id: 'base64',
    name: 'Base64 编解码',
    description: '文本编码与解码，一键搞定',
    category: 'other',
    icon: Binary,
    kind: 'base64',
    tags: ['BASE64', '编码'],
    featured: true,
  },
  {
    id: 'uuid',
    name: 'UUID 生成',
    description: '为你的灵感生成一个唯一标识',
    category: 'other',
    icon: Fingerprint,
    kind: 'uuid',
    tags: ['UUID', '随机'],
  },
  {
    id: 'color-convert',
    name: '颜色转换',
    description: '在 HEX 与 RGB 之间自由切换',
    category: 'other',
    icon: Pipette,
    kind: 'color',
    tags: ['HEX', 'RGB'],
  },
  {
    id: 'url-codec',
    name: 'URL 编解码',
    description: '处理链接里的特殊字符',
    category: 'other',
    icon: Link,
    kind: 'url',
    tags: ['URL', '编码'],
  },
]

export const findTool = (id?: string) => tools.find((tool) => tool.id === id)
export const categoryOf = (id: CategoryId) => categories.find((category) => category.id === id)!
export const searchTools = (query: string) => {
  const term = query.trim().toLowerCase()
  return tools.filter((tool) =>
    `${tool.name} ${tool.description} ${tool.tags.join(' ')} ${Object.values(categoryOf(tool.category).label).join(' ')}`
      .toLowerCase()
      .includes(term),
  )
}
