export type TierName = 'bronze' | 'silver' | 'gold'

export type Tier = {
  name:       TierName
  label:      string
  minPoints:  number
  multiplier: number
  pillClass:  string   // Tailwind bg + text classes for the pill badge
  badge:      string
}

export const TIERS: Tier[] = [
  { name: 'bronze', label: 'Bronze', minPoints:     0, multiplier: 1.0, pillClass: 'bg-amber-800  text-amber-100', badge: '🥉' },
  { name: 'silver', label: 'Silver', minPoints:  5000, multiplier: 1.5, pillClass: 'bg-slate-300  text-slate-900', badge: '🥈' },
  { name: 'gold',   label: 'Gold',   minPoints: 20000, multiplier: 2.0, pillClass: 'bg-amber-400  text-amber-900', badge: '🥇' },
]

export function getTier(lifetimePoints: number): Tier {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (lifetimePoints >= TIERS[i].minPoints) return TIERS[i]
  }
  return TIERS[0]
}

export function getTierByName(name: TierName | string): Tier {
  return TIERS.find(t => t.name === name) ?? TIERS[0]
}

export function getPointsToNextTier(lifetimePoints: number): number | null {
  const current = getTier(lifetimePoints)
  const nextIdx = TIERS.findIndex(t => t.name === current.name) + 1
  if (nextIdx >= TIERS.length) return null
  return TIERS[nextIdx].minPoints - lifetimePoints
}

// Base rate: 1 point per `bahtPerPoint` spent (default ฿10), times the tier
// multiplier. The shop configures bahtPerPoint in Settings.
export function computePointsEarned(orderTotal: number, tier: Tier, bahtPerPoint = 10): number {
  const per = bahtPerPoint > 0 ? bahtPerPoint : 10
  return Math.floor(Math.floor(orderTotal / per) * tier.multiplier)
}

// Number of visit stamps a paid order earns, given the shop's ฿-per-stamp rate.
// 0 when auto-stamping is off or the rate is invalid.
export function computeStampsEarned(orderTotal: number, bahtPerStamp: number): number {
  if (!bahtPerStamp || bahtPerStamp <= 0) return 0
  return Math.floor(orderTotal / bahtPerStamp)
}

// Stamps per loyalty card (a full card = a reward). Kept fixed for now.
export const STAMP_CARD_SIZE = 10
