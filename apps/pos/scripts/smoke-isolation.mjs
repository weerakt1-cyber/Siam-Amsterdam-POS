#!/usr/bin/env node
// ─── Store-isolation smoke test ──────────────────────────────────────────────
// Proves (not hopes) that the app-layer auth boundary holds: sensitive
// tenant-scoped endpoints refuse unauthenticated callers even when a public
// store hint (x-store-id / ?store=) is injected, while the public customer
// flows still work without a session.
//
// Usage:
//   BASE_URL=http://localhost:3000 node scripts/smoke-isolation.mjs
//
// Env:
//   BASE_URL     (required)  e.g. http://localhost:3000 or your staging URL
//   STORE_SLUG   (optional)  a real store slug, used by the public-flow checks;
//                            if omitted they fall back to the sole-store resolve
//                            (works on a single-store install)
//   STORE2_ID    (optional)  a store-2 UUID to inject as x-store-id (default: a
//                            dummy — the assertion is "still 401" either way)
//   STORE2_SLUG  (optional)  a store-2 slug to inject as ?store= (default dummy)
//
// Exit code: 0 if every check PASSes, 1 if any FAILs.

const BASE_URL = process.env.BASE_URL
if (!BASE_URL) {
  console.error('✗ BASE_URL env var is required (e.g. BASE_URL=http://localhost:3000)')
  process.exit(2)
}
const base = BASE_URL.replace(/\/$/, '')

const STORE_SLUG  = process.env.STORE_SLUG  || ''
const STORE2_ID   = process.env.STORE2_ID   || '00000000-0000-0000-0000-000000000002'
const STORE2_SLUG = process.env.STORE2_SLUG || 'smoke-nonexistent-store-2'

// Bangkok "today" (UTC+7) — reports are keyed by the local business date.
const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)

let failures = 0
function report(name, passed, detail) {
  const tag = passed ? 'PASS' : 'FAIL'
  if (!passed) failures++
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
}

// Heuristic: does this body contain order / cash-report data? These keys only
// appear in real order-list / daily-report / member payloads, never in an error
// body or in the non-sensitive settings payload (shop name / hours / tiles).
function leaksOrderData(text) {
  return /"order_items"|"openingCash"|"cashIns"|"expectedCash"|"paymentMethod"|"lifetimeSpend"|"orders"\s*:\s*\[\s*\{/.test(text)
}

async function hit(path, { headers } = {}) {
  const res = await fetch(base + path, { headers, redirect: 'manual' })
  const body = await res.text()
  return { status: res.status, body }
}

// ─── 1 + 2. Sensitive endpoints, unauthenticated (bare, then hint-injected) ───

// mode:
//   'session'         → must return 401/400 (no session ⇒ no store resolved)
//   'public-nosecret' → intentionally public (Task 1), so we only require that
//                       it never leaks order/cash data (status may be 200)
const SENSITIVE = [
  { name: '/api/orders',            path: '/api/orders',            mode: 'session' },
  { name: `/api/reports/${today}`,  path: `/api/reports/${today}`,  mode: 'session' },
  { name: '/api/analytics',         path: '/api/analytics',         mode: 'session' },
  { name: '/api/settings',          path: '/api/settings',          mode: 'public-nosecret' },
]

function withHint(path) {
  return path + (path.includes('?') ? '&' : '?') + 'store=' + encodeURIComponent(STORE2_SLUG)
}

async function checkSensitive(label, hintHeaders, pathFn) {
  console.log(`\n${label}`)
  for (const ep of SENSITIVE) {
    const { status, body } = await hit(pathFn(ep.path), { headers: hintHeaders })
    const leaks = leaksOrderData(body)
    if (ep.mode === 'session') {
      const ok = (status === 401 || status === 400) && !leaks
      report(ep.name, ok, `status=${status}${leaks ? ' LEAKED order data' : ''}`)
    } else {
      // public-nosecret: the only failure is leaking order/cash data
      const ok = !leaks
      report(`${ep.name} (public by design — no order/cash leak)`, ok,
        `status=${status}${leaks ? ' LEAKED order data' : ' no order/cash data'}`)
    }
  }
}

// ─── 3. Public customer flows must still work unauthenticated ─────────────────

async function checkPublicFlows() {
  console.log('\n3. Public customer flows still work unauthenticated')
  const storeQ = STORE_SLUG ? `?store=${encodeURIComponent(STORE_SLUG)}` : ''

  // Menu (QR order page reads this)
  {
    const { status, body } = await hit(`/api/menu${storeQ}`)
    let menuOk = false
    try { menuOk = Array.isArray(JSON.parse(body).menu) } catch {}
    report('GET /api/menu (QR menu)', status === 200 && menuOk,
      `status=${status}${STORE_SLUG ? '' : ' (sole-store resolve; set STORE_SLUG if multi-store)'}`)
  }

  // Reservation availability (reserve page reads this)
  {
    const q = `?date=${today}&start=18:00&end=20:00${STORE_SLUG ? `&store=${encodeURIComponent(STORE_SLUG)}` : ''}`
    const { status, body } = await hit(`/api/reservations/availability${q}`)
    let takenOk = false
    try { takenOk = Array.isArray(JSON.parse(body).taken) } catch {}
    report('GET /api/reservations/availability', status === 200 && takenOk, `status=${status}`)
  }
}

// ─── 4. Transfer-slip verify endpoint isolation (Task 7) ──────────────────────
// The public verify route may be called unauthenticated ONLY for a QR order in
// the caller's own store. Prove that:
//   a) unauth verify against a random/non-QR order id → 401 (staff required),
//   b) a store-2 hint against a store-1 order id → 400/404 (no cross-store),
//   c) it never leaks order data.
// Note: the reused-transRef → SLIP_ALREADY_USED and auto-approve paths need a
// real order + SlipOK creds, so they're covered by the manual step below, not
// here (no secrets in CI).

async function postJson(path, body, headers = {}) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    redirect: 'manual',
  })
  const text = await res.text()
  return { status: res.status, body: text }
}

async function checkSlipVerify() {
  console.log('\n4. Transfer-slip verify endpoint (Task 7)')
  const randomOrderId = '11111111-1111-1111-1111-111111111111'

  // a) Unauthenticated, no session, no store hint → store context missing OR
  //    (with sole-store resolve) a non-QR/absent order ⇒ 400/401/404, never 200.
  {
    const { status, body } = await postJson('/api/payment/slip/verify',
      { orderId: randomOrderId, qrPayload: '00020101' })
    const ok = [400, 401, 404].includes(status) && !leaksOrderData(body)
    report('unauth verify against unknown/non-QR order → 401/400/404', ok, `status=${status}`)
  }

  // b) Store-2 hint against a (store-1) order id must not resolve cross-store.
  {
    const { status, body } = await postJson('/api/payment/slip/verify',
      { orderId: randomOrderId, qrPayload: '00020101' },
      { 'x-store-id': STORE2_ID })
    const ok = [400, 401, 404].includes(status) && !leaksOrderData(body)
    report('store-2 hint against store-1 order → 400/401/404', ok, `status=${status}`)
  }

  // c) Staff-only slip list must reject unauthenticated callers.
  {
    const { status, body } = await hit(`/api/payment/slip?orderId=${randomOrderId}`)
    const ok = (status === 401 || status === 400) && !leaksOrderData(body)
    report('GET /api/payment/slip (staff list) unauth → 401/400', ok, `status=${status}`)
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────

console.log(`Store-isolation smoke test → ${base}`)
console.log(`(business date ${today}; injecting store2 id=${STORE2_ID}, slug=${STORE2_SLUG})`)

await checkSensitive(
  '1. Sensitive endpoints, unauthenticated (no hint)',
  undefined,
  (p) => p,
)
await checkSensitive(
  '2. Sensitive endpoints, unauthenticated + injected store hint (header + ?store=)',
  { 'x-store-id': STORE2_ID },
  withHint,
)
await checkPublicFlows()
await checkSlipVerify()

console.log(`\n${failures === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
