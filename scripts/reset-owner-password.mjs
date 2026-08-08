/**
 * reset-owner-password.mjs — reset a Supabase user's password via the Admin API.
 *
 * You run this yourself and type the new password at the prompt; it is masked and
 * never printed, logged, or sent anywhere except Supabase over HTTPS.
 *
 * Usage (from the My-App directory):
 *   node scripts/reset-owner-password.mjs
 *   node scripts/reset-owner-password.mjs someone@example.com   # override email
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_KEY from .env.local (service key stays
 * local — it is the admin secret, never commit or share it).
 */
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { createClient } from '@supabase/supabase-js'

const EMAIL = process.argv[2] || 'weerakt1@gmail.com'

// ── load .env.local ──────────────────────────────────────────────────────────
const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_KEY
if (!url || !serviceKey) {
  console.error('✗ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
  process.exit(1)
}

// ── masked password prompt (no echo) ─────────────────────────────────────────
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    const onData = () => { process.stdout.write('\x1b[2K\r' + question) } // wipe echoed chars
    process.stdin.on('data', onData)
    rl.question(question, (answer) => {
      process.stdin.off('data', onData)
      process.stdout.write('\n')
      rl.close()
      resolve(answer)
    })
  })
}

const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

console.log(`Project: ${url.replace(/^https?:\/\//, '')}`)
console.log(`Resetting password for: ${EMAIL}\n`)

// find the user id by email (paginate through the admin user list)
let user = null
for (let page = 1; page <= 20 && !user; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
  if (error) { console.error('✗ listUsers failed:', error.message); process.exit(1) }
  user = data.users.find(u => (u.email || '').toLowerCase() === EMAIL.toLowerCase())
  if (data.users.length < 200) break
}
if (!user) { console.error(`✗ No user found with email ${EMAIL}`); process.exit(1) }
console.log(`Found user id: ${user.id}`)

const pw1 = await askHidden('New password (min 6 chars): ')
if (!pw1 || pw1.length < 6) { console.error('✗ Password too short — aborted, nothing changed.'); process.exit(1) }
const pw2 = await askHidden('Confirm new password:       ')
if (pw1 !== pw2) { console.error('✗ Passwords do not match — aborted, nothing changed.'); process.exit(1) }

const { error } = await sb.auth.admin.updateUserById(user.id, { password: pw1 })
if (error) { console.error('✗ Update failed:', error.message); process.exit(1) }
console.log(`\n✅ Password updated for ${EMAIL}. Log in with the new password now.`)
