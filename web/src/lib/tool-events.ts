export const TOOL_SUCCEEDED = 'tool-succeeded'

export function reportToolSuccess() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TOOL_SUCCEEDED))
}
