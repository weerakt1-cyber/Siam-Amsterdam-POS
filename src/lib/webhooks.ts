import { supabase } from './supabase'

export type WebhookEvent = 'order.created' | 'order.paid' | 'member.created'

export type WebhookConfig = {
  id: string
  url: string
  events: string[]
  active: boolean
  secret: string
  label?: string
  createdAt: string
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

function mapWebhookConfig(row: Record<string, unknown>): WebhookConfig {
  return {
    id:        row.id as string,
    url:       row.url as string,
    events:    (row.events as string[]) ?? [],
    active:    Boolean(row.active),
    secret:    row.secret as string,
    label:     row.label as string | undefined,
    createdAt: row.created_at as string,
  }
}

export async function listWebhookConfigs(): Promise<WebhookConfig[]> {
  const { data, error } = await supabase
    .from('webhook_configs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapWebhookConfig)
}

export async function createWebhookConfig(input: {
  url: string
  events: string[]
  label?: string
}): Promise<WebhookConfig> {
  const id     = crypto.randomUUID()
  const secret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const ts     = new Date().toISOString()
  const { error } = await supabase.from('webhook_configs').insert({
    id,
    url:        input.url,
    events:     input.events,
    active:     true,
    secret,
    label:      input.label ?? null,
    created_at: ts,
    updated_at: ts,
  })
  if (error) throw error
  return { id, url: input.url, events: input.events, active: true, secret, label: input.label, createdAt: ts }
}

export async function updateWebhookConfig(
  id: string,
  data: Partial<Pick<WebhookConfig, 'url' | 'events' | 'active' | 'label'>>
): Promise<void> {
  const { error } = await supabase
    .from('webhook_configs')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteWebhookConfig(id: string): Promise<void> {
  const { error } = await supabase.from('webhook_configs').delete().eq('id', id)
  if (error) throw error
}

// ─── HMAC-SHA256 signing ──────────────────────────────────────────────────────

async function hmacSha256(secret: string, body: string): Promise<string> {
  const keyBuf  = new TextEncoder().encode(secret)
  const dataBuf = new TextEncoder().encode(body)
  const key = await crypto.subtle.importKey(
    'raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, dataBuf)
  return 'sha256=' + Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Fire webhooks ─────────────────────────────────────────────────────────────

export async function fireWebhook(event: WebhookEvent, payload: object): Promise<void> {
  let configs: WebhookConfig[]
  try {
    const { data, error } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('active', true)
      .contains('events', [event])
    if (error || !data) return
    configs = data.map(mapWebhookConfig)
  } catch { return }

  if (!configs.length) return

  const envelope = {
    event,
    timestamp: new Date().toISOString(),
    data:      payload,
  }
  const body = JSON.stringify(envelope)

  await Promise.allSettled(
    configs.map(async cfg => {
      try {
        const sig = await hmacSha256(cfg.secret, body)
        await fetch(cfg.url, {
          method:  'POST',
          headers: {
            'Content-Type':        'application/json',
            'X-Webhook-Event':     event,
            'X-Webhook-Signature': sig,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        })
      } catch (err) {
        console.error(`[Webhook] Failed to deliver ${event} to ${cfg.url}:`, err)
      }
    })
  )
}
