export { ToolUI, useToolUI } from '../components/controls'
export type { ValueControlProps, ChoiceOption } from '../components/controls'
export { ToolWorkspace, ToolFields } from './ToolWorkspace'
export { ToolRegistry, toolRegistry } from './registry'
export type { ToolDefinition, ToolField, ToolValues, ToolResult, ToolRunContext } from './registry'
export type { ToolOption } from './registry'
export { useLocale as useToolLocale } from '../lib/i18n'
export { bilingual, LocalizedError } from '../lib/locale'
export type { Locale, LocalizedText } from '../lib/locale'

import { toolRegistry } from './registry'
import { builtinTools } from './builtins'
const unregisterBuiltins = builtinTools.map((definition) =>
  toolRegistry.get(definition.id) ? () => {} : toolRegistry.register(definition),
)
if (import.meta.hot)
  import.meta.hot.dispose(() => unregisterBuiltins.forEach((unregister) => unregister()))
