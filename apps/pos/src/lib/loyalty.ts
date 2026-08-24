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

export function computePointsEarned(orderTotal: number, tier: Tier): number {
  return Math.floor(Math.floor(orderTotal / 10) * tier.multiplier)
}
