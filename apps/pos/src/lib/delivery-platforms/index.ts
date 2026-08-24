import type { DeliveryChannel } from '../types'
import type { DeliveryAdapter } from './types'
import { grabAdapter } from './grab'

export type { DeliveryAdapter, NormalizedDeliveryOrder, WebhookVerdict } from './types'

// ─── Adapter registry ─────────────────────────────────────────────────────────
// lineman / shopeefood have no public partner API yet — orders stay manual via
// /pos/delivery quick-entry. Add their adapters here when access opens up.

const ADAPTERS: Partial<Record<DeliveryChannel, DeliveryAdapter>> = {
  grab: grabAdapter,
}

export function getAdapter(channel: string): DeliveryAdapter | undefined {
  return ADAPTERS[channel as DeliveryChannel]
}
