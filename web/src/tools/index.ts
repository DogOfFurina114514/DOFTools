export { ToolUI, useToolUI } from '../components/controls'
export type { ValueControlProps, ChoiceOption } from '../components/controls'
export { ToolWorkspace, ToolFields } from './ToolWorkspace'
export { ToolRegistry, toolRegistry } from './registry'
export type { ToolDefinition, ToolField, ToolValues, ToolResult, ToolRunContext } from './registry'
export type { ToolOption } from './registry'
export { useLocale as useToolLocale } from '../lib/i18n'
export { bilingual, LocalizedError } from '../lib/locale'
export type { Locale, LocalizedText } from '../lib/locale'

// Future tools register once here; both the workspace and AI use this registry.
