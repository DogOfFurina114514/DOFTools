import type { DragEvent } from 'react'
import { CircleHelp, FolderOpen, Grid3X3, House, SearchX, Settings, Sparkles } from 'lucide-react'
import { useAppearance, type StyleId } from '../lib/appearance'
import { bilingual } from '../lib/locale'
import { toolRegistry, type ToolDefinition } from '../tools/registry'
import { ToolIcon } from './ToolIcon'

export const desktopPrograms = {
  catalog: { title: bilingual('工具目录', 'Tool Catalog'), icon: FolderOpen },
  settings: { title: bilingual('设置', 'Settings'), icon: Settings },
  ai: { title: bilingual('AI 助手', 'AI Assistant'), icon: Sparkles },
  overview: { title: bilingual('工具箱概览', 'Toolbox Overview'), icon: House },
  help: { title: bilingual('帮助', 'Help'), icon: CircleHelp },
  missing: { title: bilingual('页面未找到', 'Page not found'), icon: SearchX },
} as const

export type DesktopProgram = keyof typeof desktopPrograms
export type DesktopApp =
  { kind: 'program'; program: DesktopProgram } | { kind: 'tool'; tool: ToolDefinition }

export const primaryPrograms = ['catalog', 'settings', 'ai'] as const

export function programApp(program: DesktopProgram): DesktopApp {
  return { kind: 'program', program }
}

export const desktopAppKey = (app: DesktopApp) =>
  app.kind === 'tool' ? `tool:${app.tool.id}` : `program:${app.program}`

export function desktopAppFromKey(key: string): DesktopApp | undefined {
  if (key.startsWith('tool:')) {
    const tool = toolRegistry.get(key.slice(5))
    return tool && { kind: 'tool', tool }
  }
  const program = key.slice(8)
  if (
    key.startsWith('program:') &&
    program !== 'missing' &&
    Object.hasOwn(desktopPrograms, program)
  )
    return programApp(program as DesktopProgram)
}

export function desktopAppTitle(app: DesktopApp, style?: StyleId) {
  if (app.kind === 'tool') return app.tool.title
  if (app.program !== 'catalog') return desktopPrograms[app.program].title
  if (style === 'macos') return bilingual('启动台', 'Launchpad')
  if (style === 'windows') return bilingual('所有工具', 'All Tools')
  if (style === 'linux') return bilingual('工具应用', 'Tool Applications')
  return desktopPrograms.catalog.title
}

export const desktopAppDragType = 'application/x-doftools-app'

export function desktopAppDragProps(app: DesktopApp) {
  return {
    'data-desktop-app': desktopAppKey(app),
    draggable: true,
    onDragStart(event: DragEvent<HTMLElement>) {
      event.dataTransfer.setData(desktopAppDragType, desktopAppKey(app))
      event.dataTransfer.effectAllowed = 'copy'
    },
  }
}

export function DesktopAppGlyph({ app }: { app: DesktopApp }) {
  return (
    <span className="desktop-app-glyph" data-app={app.kind === 'program' ? app.program : 'tool'}>
      <DesktopAppIcon app={app} size={21} />
    </span>
  )
}

export function DesktopAppIcon({ app, size = 18 }: { app: DesktopApp; size?: number }) {
  const { style } = useAppearance()
  if (app.kind === 'tool') return <ToolIcon tool={app.tool} size={size} />
  const Icon =
    app.program === 'catalog' && style === 'macos' ? Grid3X3 : desktopPrograms[app.program].icon
  return <Icon size={size} aria-hidden="true" />
}
