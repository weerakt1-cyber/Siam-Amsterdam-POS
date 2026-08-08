// Server sync for bar settings + floor layout.
//
// loadBarSettings()/loadFloorTiles() read localStorage synchronously so every
// consumer stays simple. The catch: localStorage is per-device, so a reinstall
// or a second tablet started blank (shop name / tables / Google review gone).
//
// This module makes the server the source of truth and localStorage a cache:
//   • hydrateSettingsFromServer() runs once on app start — pulls the saved
//     values from /api/settings into localStorage and fires the change events
//     so any mounted screen refreshes.
//   • pushBarSettings()/pushFloorTiles() write-through to the server whenever
//     the user saves, so the next device/reinstall gets them back.

import { authedFetch } from '@/lib/supabase-browser'
import type { BarSettings } from '@/lib/printer'
import { FLOOR_LS_KEY, FLOOR_LAYOUT_CHANGED_EVENT, type TableTile } from '@/lib/floor'

// Must match LS_KEY in printer.ts / the event dispatched by the settings page.
const BAR_LS_KEY = 'pos_bar_settings'
const BAR_SETTINGS_CHANGED_EVENT = 'pos-settings-changed'

let hydrated = false

// Pull server-saved settings into localStorage. Safe to call more than once;
// only the first call hits the network. Non-fatal on failure — the app keeps
// running on whatever cache it already had.
export async function hydrateSettingsFromServer(): Promise<void> {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const r = await authedFetch('/api/settings')
    if (!r.ok) return
    const { barSettings, floorTiles } = await r.json()

    if (barSettings && typeof barSettings === 'object') {
      localStorage.setItem(BAR_LS_KEY, JSON.stringify(barSettings))
      window.dispatchEvent(new CustomEvent(BAR_SETTINGS_CHANGED_EVENT))
    }
    if (Array.isArray(floorTiles) && floorTiles.length > 0) {
      localStorage.setItem(FLOOR_LS_KEY, JSON.stringify(floorTiles))
      window.dispatchEvent(new CustomEvent(FLOOR_LAYOUT_CHANGED_EVENT))
    }
  } catch {
    // offline / unauthenticated — cache stands in until next successful sync
  }
}

// Write-through helpers. localStorage is already updated by the caller, so the
// UI never blocks on these. They resolve to `true` only when the server actually
// persisted the change — so the caller can warn instead of showing a false
// "Saved" if the write is rejected (e.g. 401/403 when the session isn't an
// admin, or the server is misconfigured). Requires admin/manager server-side.
async function pushSettings(payload: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await authedFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      console.error(`[settings] server rejected save: HTTP ${r.status}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[settings] save request failed', err)
    return false   // offline — cache stands; next save retries
  }
}

export function pushBarSettings(s: BarSettings): Promise<boolean> {
  return pushSettings({ barSettings: s })
}

export function pushFloorTiles(tiles: TableTile[]): Promise<boolean> {
  return pushSettings({ floorTiles: tiles })
}
