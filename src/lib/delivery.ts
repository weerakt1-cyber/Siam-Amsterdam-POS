import type { DeliveryChannel } from './types'

// ─── Delivery platform channel metadata (Phase 1: manual entry) ───────────────
// Phase 2 will add per-channel API adapters; this metadata stays the single
// source of truth for labels/colors/commission defaults across the app.

export type ChannelMeta = {
  label: string            // display name
  shortCode: string        // used as pseudo tableNo, e.g. "GRAB"
  icon: string             // emoji badge
  color: string            // tailwind-friendly hex for badges
  bgClass: string          // badge background classes (dark board UI)
  defaultCommission: number // fraction, e.g. 0.30 = 30%
}

export const DELIVERY_CHANNELS: Record<DeliveryChannel, ChannelMeta> = {
  grab: {
    label: 'GrabFood',
    shortCode: 'GRAB',
    icon: '🟢',
    color: '#00B14F',
    bgClass: 'bg-green-600/20 text-green-300 border-green-600/40',
    defaultCommission: 0.30,
  },
  lineman: {
    label: 'LINE MAN',
    shortCode: 'LINEMAN',
    icon: '🟩',
    color: '#06C755',
    bgClass: 'bg-emerald-600/20 text-emerald-300 border-emerald-600/40',
    defaultCommission: 0.30,
  },
  shopeefood: {
    label: 'Shopee Food',
    shortCode: 'SHOPEE',
    icon: '🟠',
    color: '#EE4D2D',
    bgClass: 'bg-orange-600/20 text-orange-300 border-orange-600/40',
    defaultCommission: 0.30,
  },
}

export const CHANNEL_KEYS = Object.keys(DELIVERY_CHANNELS) as DeliveryChannel[]

export function isDeliveryChannel(v: unknown): v is DeliveryChannel {
  return typeof v === 'string' && v in DELIVERY_CHANNELS
}

// ─── Commission settings (localStorage, client-side) ──────────────────────────
// Rates are snapshotted onto each order at creation (commissionRate), so
// changing them later never rewrites history.

const LS_KEY = 'pos_delivery_settings'

export type DeliverySettings = {
  commission: Record<DeliveryChannel, number> // fraction 0–1
}

export function loadDeliverySettings(): DeliverySettings {
  const defaults: DeliverySettings = {
    commission: {
      grab:       DELIVERY_CHANNELS.grab.defaultCommission,
      lineman:    DELIVERY_CHANNELS.lineman.defaultCommission,
      shopeefood: DELIVERY_CHANNELS.shopeefood.defaultCommission,
    },
  }
  if (typeof window === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    for (const key of CHANNEL_KEYS) {
      const v = Number(parsed?.commission?.[key])
      if (Number.isFinite(v) && v >= 0 && v <= 1) defaults.commission[key] = v
    }
  } catch { /* ignore */ }
  return defaults
}

export function saveDeliverySettings(s: DeliverySettings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}
