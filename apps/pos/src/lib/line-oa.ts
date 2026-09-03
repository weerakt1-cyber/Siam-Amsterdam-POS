// ─── Per-store LINE Official Account broadcast ───────────────────────────────
// Distinct from lib/line.ts (a single owner-notification OA driven by env vars).
// Here each store connects its OWN LINE OA and can broadcast a promo/news
// message to every friend of that OA via the Messaging API broadcast endpoint —
// no per-customer userId needed; LINE fans the message out to all followers.
//
// The channel access token is a secret: stored server-side in app_config under
// key 'line_oa' and never returned to the browser (the status endpoint exposes
// only booleans + the public basic id).

import { getConfig, setConfig } from '@/lib/store'

export type LineOaSettings = {
  enabled: boolean
  accessToken: string   // long-lived channel access token (secret, server-only)
  basicId: string       // public "@xxxx" id, for the add-friend link / display
}

const CONFIG_KEY = 'line_oa'

export async function getLineOaSettings(storeId?: string): Promise<LineOaSettings> {
  const raw = await getConfig(CONFIG_KEY, storeId)
  let parsed: Partial<LineOaSettings> = {}
  if (raw) { try { parsed = JSON.parse(raw) } catch { /* ignore */ } }
  return {
    enabled:     parsed.enabled === true,
    accessToken: parsed.accessToken ?? '',
    basicId:     parsed.basicId ?? '',
  }
}

export async function saveLineOaSettings(next: LineOaSettings, storeId?: string): Promise<void> {
  await setConfig(CONFIG_KEY, JSON.stringify(next), storeId)
}

// Broadcast a plain-text message to every friend of the OA.
// POST https://api.line.me/v2/bot/message/broadcast — 200 = accepted.
export async function broadcastLineOA(
  accessToken: string, text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ messages: [{ type: 'text', text }] }),
    })
    if (res.ok) return { ok: true }
    const body = await res.json().catch(() => ({})) as { message?: string }
    return { ok: false, error: body.message || `LINE API ${res.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' }
  }
}
