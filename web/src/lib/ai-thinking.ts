export const AI_THINKING_LEVELS = ['off', 'low', 'medium', 'high'] as const
export type AIThinkingLevel = (typeof AI_THINKING_LEVELS)[number]
export const isAIThinkingLevel = (value: unknown): value is AIThinkingLevel =>
  AI_THINKING_LEVELS.some((level) => level === value)

// These are reasoning budgets; the final answer keeps its own token allowance.
export const AI_THINKING_BUDGETS: Record<AIThinkingLevel, number> = {
  off: 0,
  low: 128,
  medium: 384,
  high: 1024,
}
