#!/usr/bin/env node
// ─── Provision a new store (Phase 4 that migration 010 left as a TODO) ────────
// Creates a `stores` row and, optionally, links an owner's profile to it so the
// new tenant is isolated from Store #1 — the manual steps you'd otherwise run by
// hand in the SQL editor, in one command. Idempotent by slug: re-running updates
// the existing store instead of duplicating it.
//
// Usage:
//   node scripts/provision-store.mjs --name "ร้านทดสอบ 2" --slug test-shop-2 \
//        [--owner-email owner@example.com] [--plan starter] [--until 2026-09-23]
//
// Flags:
//   --name         (required) display name
//   --slug         (required) url-safe id used in QR links: [a-z0-9-]
//   --owner-email  (optional) links this signed-in user's profile to the store
//                  as an approved admin. The owner must have signed in via /auth
//                  at least once (so their auth user exists); if not, the store
//                  is still created and the script tells you to re-run later.
//   --plan         (optional) default 'starter'
//   --until        (optional) YYYY-MM-DD expiry → sets subscription to 'active';
//                  omit to leave the store on 'trial'
//
// Env (auto-loaded from .env.local if present, or pass via the environment):
//   SUPABASE_URL          (or NEXT_PUBLIC_SUPABASE_URL)
//   SUPABASE_SERVICE_KEY  (or SUPABASE_SERVICE_ROLE_KEY) — service role required

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── Load .env.local (minimal parser) so the script "just works" from the repo ──
try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of raw.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (!m || line.trim().startsWith('#')) continue
    const key = m[1]
    let val = m[2].trim().replace(/^["']|["']$/g, '')
    if (process.env[key] === undefined) process.env[key] = val
  }
} catch { /* no .env.local — rely on the real environment */ }

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.error('✗ Need SUPABASE_URL and SUPABASE_SERVICE_KEY (service role) in the env or .env.local')
  process.exit(2)
}

// ── Parse --flag value args ──────────────────────────────────────────────────
function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}
const name       = arg('name')
const slug       = arg('slug')
const ownerEmail = arg('owner-email')
const plan       = arg('plan') || 'starter'
const until      = arg('until')

if (!name || !slug) {
  console.error('✗ --name and --slug are required. See the header of this file for usage.')
  process.exit(2)
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`✗ --slug must be url-safe (lowercase letters, digits, hyphens): got "${slug}"`)
  process.exit(2)
}
if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
  console.error(`✗ --until must be YYYY-MM-DD: got "${until}"`)
  process.exit(2)
}

const db = createClient(URL_, KEY, { auth: { persistSession: false } })

function die(msg, err) {
  console.error(`✗ ${msg}${err ? `: ${err.message || err}` : ''}`)
  process.exit(1)
}

// ── 1. Create or reuse the store (idempotent by slug) ────────────────────────
const subFields = until
  ? { plan, subscription_status: 'active', subscription_until: until }
  : { plan }

const { data: existing, error: findErr } = await db
  .from('stores').select('id, name, slug').eq('slug', slug).maybeSingle()
if (findErr) die('lookup store by slug failed', findErr)

let store
if (existing) {
  const { data, error } = await db
    .from('stores').update({ name, ...subFields }).eq('id', existing.id)
    .select('id, name, slug').single()
  if (error) die('update existing store failed', error)
  store = data
  console.log(`• Reused existing store (slug "${slug}") and updated it → ${store.id}`)
} else {
  const { data, error } = await db
    .from('stores').insert({ name, slug, ...subFields })
    .select('id, name, slug').single()
  if (error) die('create store failed', error)
  store = data
  console.log(`• Created store "${store.name}" (${store.slug}) → ${store.id}`)
}
console.log(`  subscription: ${until ? `active until ${until}` : 'trial (no expiry set)'}, plan=${plan}`)

// ── 2. Optionally link the owner's profile to this store ─────────────────────
if (ownerEmail) {
  // Find the auth user by email (paginate a few pages; small deployments).
  let user = null
  for (let page = 1; page <= 10 && !user; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) die('list auth users failed', error)
    user = (data.users || []).find(u => (u.email || '').toLowerCase() === ownerEmail.toLowerCase())
    if (!data.users || data.users.length < 200) break
  }

  if (!user) {
    console.log(`\n⚠ No signed-in user found for ${ownerEmail}.`)
    console.log(`  The store is created, but the owner must sign in via /auth once, then re-run:`)
    console.log(`    node scripts/provision-store.mjs --name "${name}" --slug ${slug} --owner-email ${ownerEmail}`)
    console.log(`  (or link manually: update profiles set store_id='${store.id}', role='admin', status='approved' where id='<their-uid>';)`)
  } else {
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email
    const { error } = await db.from('profiles').upsert({
      id:       user.id,
      name:     displayName,
      role:     'admin',
      status:   'approved',
      provider: 'oauth',
      store_id: store.id,
    }, { onConflict: 'id' })
    if (error) die('link owner profile failed', error)
    console.log(`\n• Linked owner ${ownerEmail} (${user.id}) → store as approved admin`)
  }
}

console.log(`\n✓ Done. QR base for this store: /order/${store.slug}/<tableNo>  ·  register: /register/${store.slug}`)
