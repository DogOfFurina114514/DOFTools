import { FileText, Globe, Image, Link, Shapes, Video, Volume2 } from 'lucide-react'
import { bilingual as b } from '../lib/locale'

export const toolTags = [
  { id: 'image', label: b('图片', 'Image'), icon: Image, color: 'green' },
  { id: 'video', label: b('视频', 'Video'), icon: Video, color: 'purple' },
  { id: 'audio', label: b('音频', 'Audio'), icon: Volume2, color: 'blue' },
  { id: 'document', label: b('文档', 'Document'), icon: FileText, color: 'orange' },
  { id: 'parse', label: b('解析', 'Parsing'), icon: Link, color: 'blue' },
  { id: 'online', label: b('仅联网', 'Online only'), icon: Globe, color: 'blue' },
  { id: 'other', label: b('其他', 'Other'), icon: Shapes, color: 'blue' },
] as const

export type ToolTagId = (typeof toolTags)[number]['id']
export const isToolTag = (id: string): id is ToolTagId => toolTags.some((tag) => tag.id === id)
export const tagOf = (id: ToolTagId) => toolTags.find((tag) => tag.id === id)!
