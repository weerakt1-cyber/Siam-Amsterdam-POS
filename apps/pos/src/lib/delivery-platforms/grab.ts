import { getConfigMany } from '../store'
import type { DeliveryAdapter, NormalizedDeliveryOrder, WebhookVerdict } from './types'
import type { OrderItem } from '../types'

// ─── GrabFood partner API adapter ─────────────────────────────────────────────
// Docs: https://developer.grab.com (GrabFood partner API)
//  - OAuth:      POST https://api.grab.com/grabid/v1/oauth2/token
//                (client_credentials, scope "food.partner_api")
//  - Accept:     POST https://partner-api.grab.com/grabfood/partner/v1/order/prepare
//  - Mark ready: POST https://partner-api.grab.com/grabfood/partner/v1/orders/mark
//  - Inbound "Submit Order" webhook: Grab POSTs the order to our registered URL,
//    authenticating with the credential we registered with Grab (checked against
//    app_config key grab_webhook_secret).
//
// Config lives in app_config (Settings → Delivery / API):
//  grab_client_id, grab_client_secret, grab_merchant_id,
//  grab_webhook_secret, grab_auto_accept ('true'|'false'), grab_commission (%)

const OAUTH_URL = 'https://api.grab.com/grabid/v1/oauth2/token'
const API_BASE  = 'https://partner-api.grab.com/grabfood'

export const GRAB_CONFIG_KEYS = [
  'grab_client_id', 'grab_client_secret', 'grab_merchant_id',
  'grab_webhook_secret', 'grab_auto_accept', 'grab_commission',
] as const

export type GrabConfig = Record<(typeof GRAB_CONFIG_KEYS)[number], string>

export async function getGrabConfig(): Promise<GrabConfig> {
  return await getConfigMany([...GRAB_CONFIG_KEYS]) as GrabConfig
}

// ─── OAuth token cache (module scope — fine for serverless, refetched per cold start) ──

let tokenCache: { token: string; expiresAt: number } | null = null

async function getAccessToken(cfg: GrabConfig): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token
  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     cfg.grab_client_id,
      client_secret: cfg.grab_client_secret,
      grant_type:    'client_credentials',
      scope:         'food.partner_api',
    }),
  })
  if (!res.ok) throw new Error(`Grab OAuth failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 }
  return tokenCache.token
}

async function grabPost(cfg: GrabConfig, path: string, body: unknown): Promise<void> {
  const token = await getAccessToken(cfg)
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Grab ${path} failed: ${res.status} ${await res.text()}`)
}

// ─── Webhook payload parsing ──────────────────────────────────────────────────
// "Submit Order" payload (SubmitOrderRequest): orderID, shortOrderNumber,
// merchantID, currency {code, exponent}, items [{id, quantity, price, ...}],
// price {...}, times {...}. Item prices are minor units (satang for THB).

type GrabWebhookItem = {
  id?: string
  grabItemID?: string
  name?: string
  quantity?: number
  price?: number
  specifications?: string
  modifiers?: { id?: string; name?: string; price?: number; quantity?: number }[]
}

function makeAdapter(cfgPromise: () => Promise<GrabConfig>): DeliveryAdapter {
  return {
    channel: 'grab',

    async isConfigured() {
      const cfg = await cfgPromise()
      return !!(cfg.grab_client_id && cfg.grab_client_secret && cfg.grab_merchant_id)
    },

    async verifyWebhook(req: Request): Promise<WebhookVerdict> {
      const cfg = await cfgPromise()
      const secret = cfg.grab_webhook_secret
      if (!secret) return { ok: false, status: 503, error: 'Grab webhook not configured' }
      const auth = req.headers.get('authorization') ?? ''
      // Grab sends the credential registered during partner onboarding.
      // Accept both raw and "Bearer <secret>" forms.
      const provided = auth.startsWith('Bearer ') ? auth.slice(7) : auth
      if (provided !== secret) return { ok: false, status: 401, error: 'Invalid webhook credentials' }
      return { ok: true }
    },

    parseOrder(body: unknown): NormalizedDeliveryOrder {
      const b = body as Record<string, unknown>
      const orderId = String(b.orderID ?? '')
      if (!orderId) throw new Error('Missing orderID in Grab webhook payload')

      const exponent = Number((b.currency as Record<string, unknown> | undefined)?.exponent ?? 2)
      const divisor  = 10 ** exponent
      const rawItems = (b.items as GrabWebhookItem[] | undefined) ?? []
      if (rawItems.length === 0) throw new Error('Grab webhook payload has no items')

      const items: OrderItem[] = rawItems.map(it => {
        // Menu sync registers OUR menu item IDs with Grab, so item.id round-trips
        // back as the POS menuId. Modifier names become the variant label.
        const modifiers = (it.modifiers ?? []).map(m => m.name).filter(Boolean).join(', ')
        const modifierPrice = (it.modifiers ?? []).reduce((s, m) => s + (Number(m.price) || 0), 0)
        return {
          menuId:       String(it.id ?? it.grabItemID ?? 'unknown'),
          name:         it.name ?? '',   // enriched from our menu by the webhook route
          nameTh:       '',
          qty:          Number(it.quantity) || 1,
          price:        ((Number(it.price) || 0) + modifierPrice) / divisor,
          variantLabel: modifiers || (it.specifications ? String(it.specifications) : undefined),
        }
      })

      const priceObj = b.price as Record<string, unknown> | undefined
      const reportedTotal = Number(priceObj?.eaterPayment ?? priceObj?.subtotal ?? 0) / divisor

      return {
        channel: 'grab',
        platformOrderId: orderId,
        platformCode: String(b.shortOrderNumber ?? orderId.slice(-6)),
        items,
        note: String(b.remark ?? b.comment ?? ''),
        total: reportedTotal || items.reduce((s, i) => s + i.price * i.qty, 0),
      }
    },

    async acceptOrder(platformOrderId: string, accept: boolean) {
      const cfg = await cfgPromise()
      if (!cfg.grab_client_id || !cfg.grab_client_secret) return // dormant until configured
      await grabPost(cfg, '/partner/v1/order/prepare', {
        orderID: platformOrderId,
        toState: accept ? 'ACCEPTED' : 'REJECTED',
      })
    },

    async markOrderReady(platformOrderId: string) {
      const cfg = await cfgPromise()
      if (!cfg.grab_client_id || !cfg.grab_client_secret) return // dormant until configured
      await grabPost(cfg, '/partner/v1/orders/mark', { orderID: platformOrderId })
    },
  }
}

export const grabAdapter = makeAdapter(getGrabConfig)
