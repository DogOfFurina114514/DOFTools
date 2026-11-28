import { Link, useNavigate, type LinkProps } from 'react-router-dom'

export function ToolLink({ toolId, ...props }: Omit<LinkProps, 'to'> & { toolId: string }) {
  return <Link {...props} to={`/tool/${toolId}`} />
}

export function useOpenTool() {
  const navigate = useNavigate()
  return (id: string) => navigate(`/tool/${id}`)
}
