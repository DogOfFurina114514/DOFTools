import { createContext, useContext, type MouseEvent } from 'react'
import { Link, useNavigate, type LinkProps } from 'react-router-dom'

export const ToolWindowLauncher = createContext<((id: string) => void) | null>(null)
export const useToolWindowLauncher = () => useContext(ToolWindowLauncher)

export function openToolWithClick(
  event: MouseEvent<HTMLAnchorElement>,
  openWindow: ReturnType<typeof useToolWindowLauncher>,
  id: string,
) {
  if (
    !openWindow ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey
  )
    return
  event.preventDefault()
  openWindow(id)
}

export function ToolLink({ toolId, ...props }: Omit<LinkProps, 'to'> & { toolId: string }) {
  const openWindow = useToolWindowLauncher()
  return (
    <Link
      {...props}
      to={`/tool/${toolId}`}
      onClick={(event) => {
        props.onClick?.(event)
        if (!props.target || props.target === '_self') openToolWithClick(event, openWindow, toolId)
      }}
    />
  )
}

export function useOpenTool() {
  const openWindow = useToolWindowLauncher()
  const navigate = useNavigate()
  return (id: string) => (openWindow ? openWindow(id) : navigate(`/tool/${id}`))
}
