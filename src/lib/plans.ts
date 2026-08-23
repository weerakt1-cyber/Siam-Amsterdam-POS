// ─── Baze POS subscription pricing / billing config ─────────────────────────
// Single source of truth for prices & policy (all amounts in THB). Editing these
// numbers changes what the super-admin console and billing page display; a store
// keeps its own `locked_price` once set, so raising a base price here never
// affects existing customers (grandfathering). See memory/pricing-model.

export type BillingCycle = 'monthly' | 'yearly'
export type PlanId = 'free' | 'pro'

export type Plan = {
  id:       PlanId
  label:    string
  monthly:  number   // ฿/mo (locked base)
  yearly:   number   // ฿/yr (locked base)
  features: string[]
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free', label: 'Free', monthly: 0, yearly: 0,
    features: ['POS + ใบเสร็จ (1 เครื่อง)'],
  },
  pro: {
    id: 'pro', label: 'Pro', monthly: 790, yearly: 9480,
    features: ['QR สั่งเอง', 'จอครัว', 'สต็อก', 'บอร์ดเดลิเวอรี'],
  },
}

export const PLAN_IDS = Object.keys(PLANS) as PlanId[]
export const isPlanId = (v: unknown): v is PlanId => typeof v === 'string' && v in PLANS

export const TRIAL_DAYS = 15

// Introductory offers — mutually exclusive (a store picks one path).
export const INTRO_MONTHLY = { price: 649, months: 6 }  // ฿649/mo for the first 6 months, then base
export const YEARLY_FIRST_YEAR_DISCOUNT = 600           // −฿600 off the first year

// AI add-on — credit model (Phase 1.5). 1 credit = ฿1 of real Claude API cost.
export const AI_ADDON = { monthly: 300, yearly: 3000, monthlyCredit: 300 }

// Payment-processing share on Omise transactions (Phase 2).
export const PAYMENT_SHARE_PCT = { min: 0.3, max: 0.5 }

export function planPrice(plan: PlanId, cycle: BillingCycle): number {
  return cycle === 'yearly' ? PLANS[plan].yearly : PLANS[plan].monthly
}

// Suggested charge for a renewal. Uses the store's locked_price when set
// (grandfathering); otherwise the base price, with the intro/first-year promo
// applied only on the store's very first payment.
export function renewalAmount(opts: {
  plan: PlanId; cycle: BillingCycle; lockedPrice?: number | null; firstPayment: boolean
}): { amount: number; months: number } {
  const months = opts.cycle === 'yearly' ? 12 : 1
  if (opts.lockedPrice != null) return { amount: opts.lockedPrice, months }
  if (opts.firstPayment) {
    if (opts.cycle === 'monthly') return { amount: INTRO_MONTHLY.price, months }
    return { amount: Math.max(0, PLANS[opts.plan].yearly - YEARLY_FIRST_YEAR_DISCOUNT), months }
  }
  return { amount: planPrice(opts.plan, opts.cycle), months }
}
