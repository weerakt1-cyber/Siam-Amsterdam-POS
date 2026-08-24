// ─── BAZE AI branding ─────────────────────────────────────────────────────────
// Single source of truth for the AI assistant's brand name and backing model.
// The display name follows the app version (package.json), e.g. 1.0.0 → "BAZE AI 1.0".
// Claude runs behind the scenes — update AI_MODEL here when a new Sonnet ships.

import { version } from '../../package.json'

const [major, minor] = version.split('.')

export const APP_VERSION = version
export const AI_NAME     = `BAZE AI ${major}.${minor}`

// Backing model (Anthropic Claude — latest Sonnet)
export const AI_MODEL = 'claude-sonnet-5'
