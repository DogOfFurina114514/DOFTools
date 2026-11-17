export function ToolboxMark({ className = '' }: { className?: string }) {
  return (
    <img
      className={className}
      src={`${import.meta.env.BASE_URL}favicon.svg?v=furina`}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
