import { Wrench } from 'lucide-react'
import type { ToolDefinition } from '../tools/registry'

export function ToolIcon({
  tool,
  size = 20,
  strokeWidth = 1.75,
  className,
}: {
  tool: Pick<ToolDefinition, 'id' | 'icon'>
  size?: number
  strokeWidth?: number
  className?: string
}) {
  const Icon = tool.icon ?? Wrench
  return (
    <Icon
      className={className}
      size={size}
      strokeWidth={strokeWidth}
      data-tool-icon={tool.id}
      aria-hidden="true"
      focusable="false"
    />
  )
}
