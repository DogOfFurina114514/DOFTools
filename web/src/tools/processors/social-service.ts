import type { ToolRunContext } from '../registry'
import type { SocialLink } from './social-parser'

/** A provider adapter returns normalized media, never raw provider JSON. */
export interface SocialResolution {
  title?: string
  media: { kind: 'video' | 'audio' | 'image'; url: string; label?: string }[]
}
export type SocialResolver = (
  link: SocialLink,
  context: ToolRunContext,
) => Promise<SocialResolution>

// 26.2.0 ships the architecture. The user will supply the resolver API.
export const socialResolver: SocialResolver | undefined = undefined
