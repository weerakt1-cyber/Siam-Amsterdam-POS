export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import {
  listWebhookConfigs,
  createWebhookConfig,
  updateWebhookConfig,
  deleteWebhookConfig,
} from '@/lib/webhooks'

const VALID_EVENTS = ['order.created', 'order.paid', 'member.created']

// Internal POS admin calls may bypass API key auth with X-Internal header.
// External integrations must present X-API-Key.
function authorized(req: NextRequest): Promise<boolean> {
  if (req.headers.get('x-internal') === '1') return Promise.resolve(true)
  return validateApiKey(req).then(k => k !== null)
}

export async function GET(req: NextRequest) {
  if (!await authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const configs = await listWebhookConfigs()
    return NextResponse.json({
      webhooks: configs.map(({ secret: _s, ...rest }) => rest),
    })
  } catch (err) {
    console.error('[Webhooks GET]', err)
    return NextResponse.json({ webhooks: [] })
  }
}

export async function POST(req: NextRequest) {
  if (!await authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { url, events, label } = body

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: 'events array is required' }, { status: 400 })
  }
  const invalid = events.filter((e: string) => !VALID_EVENTS.includes(e))
  if (invalid.length) {
    return NextResponse.json(
      { error: `Invalid events: ${invalid.join(', ')}. Valid: ${VALID_EVENTS.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    new URL(url)
  } catch {
    return NextResponse.json({ error: 'url must be a valid URL' }, { status: 400 })
  }

  try {
    const config = await createWebhookConfig({ url, events, label })
    return NextResponse.json({ webhook: config }, { status: 201 })
  } catch (err) {
    console.error('[Webhooks POST]', err)
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!await authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...update } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  try {
    const allowed = { url: update.url, events: update.events, active: update.active, label: update.label }
    await updateWebhookConfig(id, allowed)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Webhooks PATCH]', err)
    return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!await authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id query param required' }, { status: 400 })

  try {
    await deleteWebhookConfig(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Webhooks DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 })
  }
}
