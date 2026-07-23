import type { DeliveryChannel, OrderItem } from '../types'

// ─── Platform-agnostic adapter contract (server-side only) ────────────────────
// Each delivery platform implements this interface. The generic webhook route
// (/api/delivery/webhooks/[platform]) and the order status flow call adapters
// through it, so adding a platform = one new adapter file registered in index.ts.

/** A platform webhook order normalized into POS terms. */
export type NormalizedDeliveryOrder = {
  channel: DeliveryChannel
  platformOrderId: string    // platform's unique order ID (idempotency key)
  platformCode: string       // short code shown to rider/staff, e.g. "GF-1234"
  items: OrderItem[]
  note: string
  /** Order total in baht as the platform reports it (customer-paid basis). */
  total: number
}

export type WebhookVerdict =
  | { ok: true }
  | { ok: false; status: number; error: string }

export interface DeliveryAdapter {
  channel: DeliveryChannel

  /** True when enough config is present to talk to the platform API. */
  isConfigured(): Promise<boolean>

  /**
   * Authenticate an incoming webhook request. Adapters compare the
   * Authorization header against the partner-registered secret.
   */
  verifyWebhook(req: Request): Promise<WebhookVerdict>

  /** Parse a platform webhook body into a normalized order (throws on bad payload). */
  parseOrder(body: unknown): NormalizedDeliveryOrder

  /** Accept or reject a pushed order on the platform. No-op if unconfigured. */
  acceptOrder(platformOrderId: string, accept: boolean): Promise<void>

  /** Tell the platform the food is ready for rider pickup. No-op if unconfigured. */
  markOrderReady(platformOrderId: string): Promise<void>
}
