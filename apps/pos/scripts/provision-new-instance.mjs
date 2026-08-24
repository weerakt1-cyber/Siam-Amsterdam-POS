#!/usr/bin/env node
// ============================================================================
// Baze POS — new customer instance provisioner (Tier 1 of
// docs/provisioning-playbook.md).
//
// Run from the repo root:  node scripts/provision-new-instance.mjs
//
// What this DOES automate:
//   1. Create a new Supabase project (via `supabase` CLI)
//   2. Apply every migration in supabase/migrations/ to it, in order
//   3. Generate a .env.<slug>.local file covering every env var the app reads
//   4. Scaffold a Vercel project and push the env vars you provide
//   5. Run `npm run build` to verify the checkout compiles before you deploy
//
// What this does NOT do (see Tier 2 in docs/provisioning-playbook.md):
//   - Create Google/LINE OAuth apps
//   - Set the new Supabase project's Auth Site URL / redirect allow-list
//   - Connect a custom domain in Vercel / configure DNS
//   - Create the Google Sheets service account or share the sheet
//   - Create the Telegram bot / find the chat ID
//   - Decide the Android app identity (appId) for a white-labeled APK
//
// Secrets are never hardcoded here. Every secret value is either read from an
// interactive prompt (piped straight to the target CLI's stdin) or captured
// from a command's own output — never passed as a plain CLI argument, so it
// doesn't linger in shell history or a process list.
// ============================================================================

import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { writeFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations')

const rl = createInterface({ input: stdin, output: stdout })

// ─── Master env var list — the ONE place that must stay in sync with every
// file that reads process.env.* (src/lib/supabase.ts, src/lib/supabase-browser.ts,
// src/lib/telegram.ts, src/lib/line.ts, src/lib/sheets.ts, src/lib/api-auth.ts (n/a
// — reads from DB not env), src/app/api/auth/line/*, src/app/api/payment/omise/*,
// src/app/pos/settings/page.tsx, src/components/pos/{AIChatPanel,GoogleAuthGuard,
// OmisePaymentModal}.tsx, src/app/api/drawer/route.ts, src/app/api/ai/*). If you
// add a new process.env.X read anywhere in src/, add it here too.
//
//   group        — section heading in the generated .env file
//   required     — core app is non-functional without it
//   autoFromSupabase — filled automatically from the Supabase project this
//                      script just created/linked, never prompted
//   secret       — sensitive; piped to stdin for `vercel env add`, never
//                  echoed or passed as a CLI arg
const ENV_VARS = [
  // ─── Supabase (required) ──────────────────────────────────────────────────
  { name: 'NEXT_PUBLIC_SUPABASE_URL', group: 'Supabase', required: true, autoFromSupabase: 'url',
    note: 'Client-side Supabase URL.' },
  { name: 'SUPABASE_URL', group: 'Supabase', required: true, autoFromSupabase: 'url',
    note: 'Server-side Supabase URL — same value as NEXT_PUBLIC_SUPABASE_URL. src/lib/supabase.ts falls back to the NEXT_PUBLIC_ one if this is unset, but set both explicitly.' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', group: 'Supabase', required: true, autoFromSupabase: 'anon',
    note: 'Dashboard → Settings → API → Project API keys → anon/public.' },
  { name: 'SUPABASE_SERVICE_KEY', group: 'Supabase', required: true, secret: true, autoFromSupabase: 'service_role',
    note: 'Dashboard → Settings → API → Project API keys → service_role. Bypasses RLS — server-only, never send to the browser.' },

  // ─── App URL (optional — only feeds LINE OAuth redirect construction) ────
  { name: 'NEXT_PUBLIC_APP_URL', group: 'App URL', required: false,
    note: 'Only used to build the LINE OAuth redirect_uri (src/app/api/auth/line/route.ts). Needed only if this customer wants LINE login.' },

  // ─── Printer (optional — Bluetooth needs no env var) ──────────────────────
  { name: 'PRINTER_HOST', group: 'Printer (optional — LAN only)', required: false,
    note: 'LAN/Wi-Fi thermal printer IP. Leave blank if this venue uses the Bluetooth printer via the Android APK.' },
  { name: 'PRINTER_PORT', group: 'Printer (optional — LAN only)', required: false, default: '9100',
    note: 'Raw ESC/POS port. Only matters if PRINTER_HOST is set.' },

  // ─── Google Sheets export (optional) ──────────────────────────────────────
  { name: 'GOOGLE_SHEETS_SERVICE_ACCOUNT', group: 'Google Sheets export (optional)', required: false, secret: true,
    note: 'Full service-account JSON key as ONE line. See Tier 2 in the playbook for how to create it.' },
  { name: 'GOOGLE_SHEET_ID', group: 'Google Sheets export (optional)', required: false,
    note: 'Spreadsheet ID from its URL. The sheet must be shared with the service account\'s client_email (Editor).' },

  // ─── Telegram order alerts (optional) ─────────────────────────────────────
  { name: 'TELEGRAM_BOT_TOKEN', group: 'Telegram order alerts (optional)', required: false, secret: true,
    note: 'From @BotFather → /newbot.' },
  { name: 'TELEGRAM_CHAT_ID', group: 'Telegram order alerts (optional)', required: false,
    note: 'Chat/group id the bot posts order alerts + daily summary to.' },

  // ─── LINE login (optional — OUT OF SCOPE for V1 per project decision) ────
  { name: 'LINE_CLIENT_ID', group: 'LINE login (optional — skip unless requested)', required: false,
    note: 'LINE Login channel Client ID. Skip entirely unless this customer explicitly wants LINE login.' },
  { name: 'LINE_CLIENT_SECRET', group: 'LINE login (optional — skip unless requested)', required: false, secret: true,
    note: 'LINE Login channel Client Secret.' },
  { name: 'NEXT_PUBLIC_LINE_CLIENT_ID', group: 'LINE login (optional — skip unless requested)', required: false,
    note: 'Same value as LINE_CLIENT_ID, exposed to the browser to build the LINE authorize URL.' },

  // ─── LINE Messaging API push (optional — separate feature from LINE login)
  { name: 'LINE_CHANNEL_ACCESS_TOKEN', group: 'LINE Messaging API push (optional)', required: false, secret: true,
    note: 'Messaging API channel access token — separate from the LINE Login channel above.' },
  { name: 'LINE_TARGET_ID', group: 'LINE Messaging API push (optional)', required: false,
    note: 'userId/groupId/roomId the bot pushes order alerts to.' },

  // ─── Legacy Google Sign-In gate (optional, cosmetic) ──────────────────────
  { name: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID', group: 'Legacy Google Sign-In badge (optional)', required: false,
    note: 'Legacy secondary gate (GoogleAuthGuard) — today only powers the cosmetic OwnerProfileBadge in Settings. Unrelated to Supabase Auth\'s own Google provider (that\'s configured in the Supabase dashboard, not an env var). Safe to leave blank.' },

  // ─── Plan tier (optional, defaults to starter) ────────────────────────────
  { name: 'NEXT_PUBLIC_POS_PLAN', group: 'Plan tier (optional)', required: false, default: 'starter',
    note: 'starter | pro | enterprise — controls months of history AI features can see. Defaults to starter if unset.' },

  // ─── AI features (optional) ───────────────────────────────────────────────
  { name: 'ANTHROPIC_API_KEY', group: 'AI features (optional)', required: false, secret: true,
    note: 'Powers the AI Chat Panel + Menu Optimize. Leave blank to disable both gracefully.' },

  // ─── Omise payments (optional) ────────────────────────────────────────────
  { name: 'OMISE_SECRET_KEY', group: 'Omise payments (optional)', required: false, secret: true,
    note: 'dashboard.omise.co → Developers → API Keys. Leave blank if this venue only takes cash/manual payment methods.' },
  { name: 'NEXT_PUBLIC_OMISE_PUBLIC_KEY', group: 'Omise payments (optional)', required: false,
    note: 'Omise public key, paired with OMISE_SECRET_KEY above.' },
]

// ─── Small helpers ──────────────────────────────────────────────────────────

function log(msg) { stdout.write(msg + '\n') }
function heading(title) { log('\n' + '─'.repeat(78) + '\n' + title + '\n' + '─'.repeat(78)) }

async function ask(question, { default: def } = {}) {
  const suffix = def ? ` [${def}]` : ''
  const answer = (await rl.question(`${question}${suffix}: `)).trim()
  return answer || def || ''
}

async function askYesNo(question, defaultYes = false) {
  const hint = defaultYes ? 'Y/n' : 'y/N'
  const answer = (await rl.question(`${question} (${hint}): `)).trim().toLowerCase()
  if (!answer) return defaultYes
  return answer === 'y' || answer === 'yes'
}

// Runs a CLI command with full stdio inherited — use for anything the CLI
// itself needs to prompt for interactively (passwords, login flows), so the
// secret goes straight from the operator's keyboard to the CLI and never
// touches this script's memory or argv.
function runInteractive(cmd, args) {
  log(`\n$ ${cmd} ${args.join(' ')}`)
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  return res.status === 0
}

// Runs a CLI command and captures stdout — use for read-only/informational
// commands whose output we need to parse (project ref, api keys JSON).
function runCapture(cmd, args) {
  log(`\n$ ${cmd} ${args.join(' ')}`)
  const res = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' })
  if (res.status !== 0) {
    log(res.stderr || res.stdout || `(exit ${res.status})`)
    return null
  }
  return res.stdout
}

// Runs a CLI command, piping `value` to its stdin — use for anything that
// accepts a secret via stdin (vercel env add) so the value never appears as a
// plain argv entry.
function runWithStdin(cmd, args, value) {
  log(`\n$ ${cmd} ${args.join(' ')}   (value piped via stdin)`)
  const res = spawnSync(cmd, args, { input: value, encoding: 'utf8', shell: process.platform === 'win32' })
  if (res.status !== 0) log(res.stderr || res.stdout || `(exit ${res.status})`)
  return res.status === 0
}

function npx(pkgWithVersion) {
  // Pin CLI versions so re-running this script months from now can't silently
  // pick up a breaking major-version CLI update mid-provisioning.
  return ['npx', '--yes', pkgWithVersion]
}

const SUPABASE_PKG = 'supabase@2.109.1'
const VERCEL_PKG = 'vercel@55.0.0'

// ─── Step 1: Supabase project ──────────────────────────────────────────────

async function stepSupabaseProject(slug) {
  heading('Step 1/5 — Supabase project')

  const [npxCmd, ...npxArgsBase] = npx(SUPABASE_PKG)

  log('Checking Supabase CLI login status...')
  const whoami = runCapture(npxCmd, [...npxArgsBase, 'projects', 'list'])
  if (whoami === null) {
    log('\nNot logged in (or CLI not reachable). Run this in another terminal, then re-run this script:')
    log(`  ${npxCmd} ${npxArgsBase.join(' ')} login`)
    const proceed = await askYesNo('Have you now logged in and want to continue?', false)
    if (!proceed) { log('Stopping — re-run the script after logging in.'); process.exit(1) }
  }

  const createNew = await askYesNo(`Create a brand-new Supabase project for "${slug}" now?`, true)

  let projectRef
  if (createNew) {
    log('\nListing organizations you belong to...')
    runCapture(npxCmd, [...npxArgsBase, 'orgs', 'list'])
    const orgId = await ask('Org ID to create the project in (from the list above)')

    const REGIONS = ['ap-southeast-1 (Singapore)', 'ap-southeast-2 (Sydney)', 'us-east-1', 'us-west-1', 'eu-west-1']
    log(`\nCommon regions: ${REGIONS.join(', ')}`)
    const region = await ask('Region', { default: 'ap-southeast-1' })

    log('\nEnter a database password for the new project.')
    log('(Typed directly into the Supabase CLI prompt below — this script never sees it.)')
    const created = runInteractive(npxCmd, [...npxArgsBase, 'projects', 'create', slug, '--org-id', orgId, '--region', region])
    if (!created) { log('Project creation failed or was cancelled — see output above.'); process.exit(1) }

    log('\nListing projects to find the new project ref...')
    const listJson = runCapture(npxCmd, [...npxArgsBase, 'projects', 'list', '--output-format', 'json'])
    if (listJson) {
      try {
        const projects = JSON.parse(listJson)
        const match = projects.find(p => (p.name ?? '').toLowerCase() === slug.toLowerCase())
        if (match) projectRef = match.id ?? match.ref
      } catch { /* fall through to manual entry */ }
    }
  }

  if (!projectRef) {
    projectRef = await ask('Supabase project ref (from the dashboard URL, e.g. abcdefghijklmnopqrst)')
  }

  heading('Linking the local repo to this Supabase project')
  log('The CLI will prompt for the database password interactively — type it there, not here.')
  const linked = runInteractive(npxCmd, [...npxArgsBase, 'link', '--project-ref', projectRef])
  if (!linked) { log('`supabase link` failed — check the output above before continuing.'); process.exit(1) }

  return { projectRef }
}

// ─── Step 2: Apply migrations ───────────────────────────────────────────────

async function stepApplyMigrations() {
  heading('Step 2/5 — Apply migrations')

  const files = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
    : []

  if (files.length === 0) {
    log(`No .sql files found in ${MIGRATIONS_DIR} — nothing to apply.`)
    return
  }

  log(`Found ${files.length} migration(s), applied in order:`)
  files.forEach(f => log(`  - ${f}`))

  const [npxCmd, ...npxArgsBase] = npx(SUPABASE_PKG)
  log('\n`supabase db push` applies every migration not yet recorded on the remote')
  log('project — safe to re-run; already-applied migrations are skipped automatically.')
  const pushed = runInteractive(npxCmd, [...npxArgsBase, 'db', 'push', '--linked'])
  if (!pushed) {
    log('\n`supabase db push` failed. Common cause: it prompts to confirm before')
    log('applying — re-run manually and answer the prompt:')
    log(`  ${npxCmd} ${npxArgsBase.join(' ')} db push --linked`)
  }
}

// ─── Step 3: Fetch keys + generate .env file ───────────────────────────────

async function stepGenerateEnvFile(slug, projectRef) {
  heading('Step 3/5 — Generate .env.' + slug + '.local')

  const [npxCmd, ...npxArgsBase] = npx(SUPABASE_PKG)
  const autoValues = { url: `https://${projectRef}.supabase.co`, anon: '', service_role: '' }

  log('Fetching API keys for the new project...')
  const keysJson = runCapture(npxCmd, [...npxArgsBase, 'projects', 'api-keys', '--project-ref', projectRef, '--reveal', '--output-format', 'json'])
  if (keysJson) {
    try {
      const keys = JSON.parse(keysJson)
      const anon = keys.find(k => k.name === 'anon' || k.api_key?.startsWith?.('anon'))
      const service = keys.find(k => k.name === 'service_role')
      if (anon) autoValues.anon = anon.api_key
      if (service) autoValues.service_role = service.api_key
    } catch {
      log('Could not parse key output automatically — you\'ll be prompted for the anon/service keys instead.')
    }
  }
  if (!autoValues.anon) autoValues.anon = await ask('NEXT_PUBLIC_SUPABASE_ANON_KEY (Dashboard → Settings → API)')
  if (!autoValues.service_role) autoValues.service_role = await ask('SUPABASE_SERVICE_KEY (Dashboard → Settings → API → service_role)')

  const values = {}
  const groups = [...new Set(ENV_VARS.map(v => v.group))]
  const lines = [
    `# Generated by scripts/provision-new-instance.mjs for customer slug: ${slug}`,
    `# Cross-reference: docs/provisioning-playbook.md`,
    `# This file is a LOCAL reference/testing copy — the values that matter for`,
    `# production are the ones pushed into Vercel in step 4, not this file.`,
    '',
  ]

  for (const group of groups) {
    lines.push(`# ─── ${group} ${'─'.repeat(Math.max(0, 70 - group.length))}`)
    for (const v of ENV_VARS.filter(x => x.group === group)) {
      let value = v.autoFromSupabase ? autoValues[v.autoFromSupabase] : ''
      if (!value && v.required) {
        value = await ask(`${v.name}${v.note ? ` — ${v.note}` : ''}`)
      } else if (!value && v.default) {
        value = v.default
      } else if (!value && !v.required) {
        const fill = await askYesNo(`Set ${v.name} now? (${v.note ?? ''})`, false)
        if (fill) value = await ask(v.name)
      }
      values[v.name] = value
      if (v.note) lines.push(`# ${v.note}`)
      lines.push(`${v.name}=${value}`)
    }
    lines.push('')
  }

  const envPath = path.join(REPO_ROOT, `.env.${slug}.local`)
  writeFileSync(envPath, lines.join('\n'), 'utf8')
  log(`\nWrote ${envPath}`)
  log('This file is git-ignored (matches .env* in .gitignore) — safe to leave on disk,')
  log('but treat it like any other secrets file.')

  return values
}

// ─── Step 4: Scaffold Vercel project + push env vars ───────────────────────

async function stepVercel(slug, values) {
  heading('Step 4/5 — Vercel project + environment variables')

  const doVercel = await askYesNo('Set up the Vercel project now?', true)
  if (!doVercel) return

  const [npxCmd, ...npxArgsBase] = npx(VERCEL_PKG)

  log('Linking (or creating) the Vercel project for this customer...')
  log('This opens Vercel\'s own interactive prompts — pick "Link to existing project"')
  log(`or create a new one named e.g. "${slug}".`)
  runInteractive(npxCmd, [...npxArgsBase, 'link'])

  const pushNow = await askYesNo('Push the env vars collected above into Vercel (Production) now?', true)
  if (!pushNow) {
    log('Skipped. You can push them later with `vercel env add <NAME> production`.')
    return
  }

  for (const v of ENV_VARS) {
    const value = values[v.name]
    if (!value) continue // never push an empty var — absence is the correct state to leave it in
    runWithStdin(npxCmd, [...npxArgsBase, 'env', 'add', v.name, 'production', '--yes'], value + '\n')
  }

  log('\nDone. NEXT_PUBLIC_ vars are inlined into the JS bundle at BUILD time, not')
  log('read at runtime — if you change one later, you MUST trigger a fresh Vercel')
  log('build that does NOT reuse the build cache (Vercel dashboard → Deployments →')
  log('"..." menu → Redeploy → uncheck "Use existing Build Cache"), otherwise the')
  log('old value keeps shipping even though the env var shows the new value.')
}

// ─── Step 5: Verify build ───────────────────────────────────────────────────

async function stepVerifyBuild() {
  heading('Step 5/5 — Verify the build')

  const run = await askYesNo('Run `npm run build` now to verify the checkout compiles?', true)
  if (!run) return

  log('\nNote: this builds using whatever .env.local (if any) is already in this')
  log('checkout — it does NOT swap in the new .env.<slug>.local automatically, so')
  log('it will not fail even if the new customer\'s Supabase project is unreachable')
  log('(src/lib/supabase.ts falls back to a placeholder client at build time).')
  log('This step only proves the CODE compiles, not that the new project is wired up.')

  const res = spawnSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit', shell: true })
  if (res.status === 0) {
    log('\n✓ Build passed.')
  } else {
    log('\n✗ Build FAILED — fix the errors above before deploying.')
    process.exitCode = 1
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  heading('Baze POS — new instance provisioner')
  log('This automates Tier 1 of docs/provisioning-playbook.md.')
  log('Tier 2 (OAuth apps, Auth redirect URLs, custom domains, Sheets/Telegram/LINE')
  log('account setup, Android appId decision) stays manual — see that doc.')
  log('\nThis will NOT run against a real project unless you explicitly confirm each step.')

  const slug = await ask('Customer slug (lowercase, hyphens only, e.g. "acme-bar")')
  if (!/^[a-z0-9-]+$/.test(slug)) {
    log('Slug must be lowercase letters, numbers, and hyphens only.'); process.exit(1)
  }

  const { projectRef } = await stepSupabaseProject(slug)
  await stepApplyMigrations()
  const values = await stepGenerateEnvFile(slug, projectRef)
  await stepVercel(slug, values)
  await stepVerifyBuild()

  heading('Tier 1 automation complete')
  log(`Next: work through Tier 2 in docs/provisioning-playbook.md for "${slug}"`)
  log('(Auth redirect URLs, custom domain/DNS, Sheets service account, Telegram bot,')
  log('LINE setup if in scope, Android appId decision) before handing off to the customer.')

  rl.close()
}

main().catch(err => {
  log(`\nUnexpected error: ${err.stack ?? err}`)
  rl.close()
  process.exit(1)
})
