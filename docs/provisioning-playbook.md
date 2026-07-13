# Provisioning a new customer instance (Model A — isolated Supabase + Vercel per customer)

This is the repeatable playbook for standing up a brand-new, fully isolated deployment of
this app for a new venue/customer: its own Supabase project (own database, own auth users)
and its own Vercel project (own domain, own env vars). It's derived from what was actually
done to stand up the first live instance (`siam-amsterdam-pos` / Baze POS), including the
gotchas hit along the way — not generic Supabase/Vercel documentation.

**Two tiers:**
- **Tier 1** — safely automatable. Run `node scripts/provision-new-instance.mjs` (repo root)
  and follow its prompts. It does not touch a real project unless you confirm each step.
- **Tier 2** — genuinely manual (third-party consoles, account/credential creation, DNS).
  Work through this checklist by hand for every new customer.

---

## Before you start

- [ ] You're logged in to the Supabase CLI (`npx supabase login`) and Vercel CLI
      (`npx vercel login`) with an account that has access to create new projects.
- [ ] You've picked a **customer slug** (lowercase, hyphens, e.g. `acme-bar`) — used to name
      the Supabase project, the Vercel project, and the generated `.env.<slug>.local` file.
- [ ] You know whether this customer is in scope for: LINE login, LINE Messaging API push,
      Google Sheets export, Telegram alerts, Omise payments, AI features, a white-labeled
      Android app. (Everything is optional/additive — the app runs fully functional POS
      features with just the four required Supabase vars set.)

---

## Tier 1 — automated (`scripts/provision-new-instance.mjs`)

Run:
```
node scripts/provision-new-instance.mjs
```

It walks through, in order:

1. **Create the Supabase project** — via the `supabase` CLI (`supabase projects create`).
   Prompts for org ID and region; the DB password is typed directly into the Supabase CLI's
   own prompt (never passed through this script or logged).
2. **Apply migrations** — runs `supabase db push --linked`, which applies every `.sql` file
   in `supabase/migrations/` **not yet recorded on the remote project**, in filename order.
   Safe to re-run.
3. **Generate `.env.<slug>.local`** — built from a single source-of-truth list in the script
   that's cross-referenced against every file in `src/` that reads `process.env.*` (see the
   full table below). The four required Supabase vars are auto-filled from the project just
   created; everything else is prompted for, and you can skip anything not in scope for this
   customer (skipped vars are simply absent from the file, not written as empty strings).
4. **Scaffold the Vercel project + push env vars** — `vercel link` to create/link the
   project, then `vercel env add <NAME> production` for each var you provided, with the
   value piped via stdin (never a plain CLI argument, so it can't end up in shell history or
   a process listing).
5. **Verify the build** — runs `npm run build` in the current checkout. This proves the
   *code* compiles; it does **not** prove the new customer's Supabase project is correctly
   wired up (the build succeeds even with placeholder/missing env vars — see the Supabase
   client fallback gotcha below).

**Explicitly out of scope for the script** (Tier 2, below): OAuth app creation, Supabase Auth
redirect URL configuration, custom domain/DNS, Google Sheets service account creation,
Telegram bot creation, LINE channel creation, and the Android app identity decision. These
involve account creation, credential handling in third-party consoles, or genuine judgment
calls — not safe or sensible to script.

---

## Master environment variable reference

Every var here is cross-referenced against an actual `process.env.*` read in `src/`. If you
add a new one to the code, add it to `ENV_VARS` in `scripts/provision-new-instance.mjs` too.

| Variable | Required? | Read by | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Required** | `src/lib/supabase-browser.ts`, `src/lib/supabase.ts` | Client-side Supabase URL. |
| `SUPABASE_URL` | **Required** | `src/lib/supabase.ts` | Server-side; same value as above. Code falls back to the `NEXT_PUBLIC_` var if unset, but set both explicitly. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Required** | `src/lib/supabase-browser.ts`, `src/lib/supabase.ts` | Dashboard → Settings → API → anon/public key. |
| `SUPABASE_SERVICE_KEY` | **Required**, secret | `src/lib/supabase.ts` | Dashboard → Settings → API → service_role key. Bypasses RLS — server-only. |
| `NEXT_PUBLIC_APP_URL` | Optional | `src/app/api/auth/line/route.ts` | Only feeds the LINE OAuth `redirect_uri`. Needed only if LINE login is enabled. |
| `PRINTER_HOST` | Optional | `src/app/api/drawer/route.ts`, `src/lib/printer.ts` | LAN/Wi-Fi printer IP. Leave blank for Bluetooth (Android APK) printers. |
| `PRINTER_PORT` | Optional (default `9100`) | same | Only matters if `PRINTER_HOST` is set. |
| `GOOGLE_SHEETS_SERVICE_ACCOUNT` | Optional, secret | `src/lib/sheets.ts` | Full service-account JSON key, as one line. |
| `GOOGLE_SHEET_ID` | Optional | `src/lib/sheets.ts` | Spreadsheet ID from its URL. |
| `TELEGRAM_BOT_TOKEN` | Optional, secret | `src/lib/telegram.ts` | From @BotFather. |
| `TELEGRAM_CHAT_ID` | Optional | `src/lib/telegram.ts` | Chat/group the bot posts to. |
| `LINE_CLIENT_ID` | Optional | `src/app/api/auth/line/route.ts`, `callback/route.ts` | LINE **Login** channel — out of scope for V1 per current project decision. Skip unless a customer explicitly asks for LINE login. |
| `LINE_CLIENT_SECRET` | Optional, secret | `src/app/api/auth/line/callback/route.ts` | Pairs with `LINE_CLIENT_ID`. |
| `NEXT_PUBLIC_LINE_CLIENT_ID` | Optional | `src/app/auth/page.tsx` | Same value as `LINE_CLIENT_ID`, exposed client-side to build the authorize URL. |
| `LINE_CHANNEL_ACCESS_TOKEN` | Optional, secret | `src/lib/line.ts` | LINE **Messaging API** push notifications — a *different* LINE product from LINE Login above. |
| `LINE_TARGET_ID` | Optional | `src/lib/line.ts` | userId/groupId/roomId the bot pushes order alerts to. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional | `src/components/pos/GoogleAuthGuard.tsx`, `src/app/pos/settings/page.tsx` | Legacy secondary Google Sign-In gate — today only powers the cosmetic `OwnerProfileBadge` in Settings. **Not** related to Supabase Auth's own Google provider (that's a Supabase Dashboard setting, not an env var). Safe to leave blank. |
| `NEXT_PUBLIC_POS_PLAN` | Optional (default `starter`) | `src/components/pos/AIChatPanel.tsx` | `starter \| pro \| enterprise` — controls months of history AI features see. |
| `ANTHROPIC_API_KEY` | Optional, secret | `src/app/api/ai/chat/route.ts`, `src/app/api/ai/menu-optimize/route.ts` | Powers AI Chat Panel + Menu Optimize. Blank disables both gracefully. |
| `OMISE_SECRET_KEY` | Optional, secret | `src/app/api/payment/omise/route.ts`, `[chargeId]/route.ts` | Omise payment gateway. Blank if venue only takes cash/manual. |
| `NEXT_PUBLIC_OMISE_PUBLIC_KEY` | Optional | `src/components/pos/OmisePaymentModal.tsx` | Pairs with `OMISE_SECRET_KEY`. |

Note: `src/lib/supabase.ts` also falls back to a `SUPABASE_ANON_KEY` (no `NEXT_PUBLIC_`
prefix) if `SUPABASE_SERVICE_KEY` is unset — this is a legacy fallback alias, not something
you need to set separately. Always set `SUPABASE_SERVICE_KEY`.

---

## Tier 2 — manual checklist

Work through this for every new customer. Nothing here should be scripted — each step
involves creating an account/credential in a third-party console or a judgment call.

### 1. Supabase Auth — Site URL + redirect allow-list (do this even if only using
   email/password login — Google/LINE need it explicitly)

There are **two separate redirect configurations**, easy to conflate:

- [ ] **Google Cloud Console** (only if this customer's project shares — or gets its own —
      Google OAuth client; see §2): under the OAuth client's *Authorized redirect URIs*, add
      Supabase's own callback: `https://<new-project-ref>.supabase.co/auth/v1/callback`.
      This is Supabase's endpoint, **not** this app's `/auth/callback` page.
- [ ] **Supabase Dashboard → Authentication → URL Configuration** (new project):
  - **Site URL** = the customer's production URL (e.g. `https://acme-bar.vercel.app` or
    their custom domain).
  - **Redirect URLs** allow-list must include:
    - `https://<production-domain>/auth/callback`
    - `http://localhost:3000/auth/callback` (only if you'll test locally against this
      project)
  - This app's own OAuth flow (`src/app/auth/page.tsx`) calls
    `signInWithOAuth({ redirectTo: '<origin>/auth/callback' })` — if the domain isn't in
    this allow-list, Supabase silently rejects the redirect and login fails with no
    obvious error client-side. **This was hit once already on the first instance — check
    it explicitly, don't assume the default Site URL is right.**

### 2. Google OAuth client (Google login)

- [ ] **Decide: share the master app's OAuth client, or create a dedicated one?**
  - Share (default, fastest): the Google consent screen shows "Baze POS" regardless of
    which customer is logging in. Zero setup — just add the new project's Supabase
    callback URL (§1) to the existing OAuth client's redirect URIs.
  - Dedicated (only if the customer wants their own branding on the Google consent
    screen): create a new OAuth 2.0 Client ID in Google Cloud Console (Application type:
    Web application), add the Supabase callback URL, and put its Client ID/Secret into
    that Supabase project's Auth → Providers → Google settings (this is a Supabase
    Dashboard field, not an env var in this repo).

### 3. LINE (only if this customer is in scope for it — skip entirely otherwise)

LINE is **two separate products** — confirm which one(s) this customer actually wants
before doing either:

- [ ] **LINE Login channel** (OAuth-based login, alternative to Google) — create at
      [developers.line.biz](https://developers.line.biz) → new channel, type "LINE Login".
      Set `LINE_CLIENT_ID` / `LINE_CLIENT_SECRET` / `NEXT_PUBLIC_LINE_CLIENT_ID`. Currently
      out of scope for V1 on the master instance — don't set these up by default.
- [ ] **LINE Messaging API channel** (push order alerts to a LINE group, parallel to
      Telegram) — create a "Messaging API" channel, get the channel access token, add the
      bot to the target group/get the userId. Set `LINE_CHANNEL_ACCESS_TOKEN` /
      `LINE_TARGET_ID`.

### 4. Telegram bot (order alerts + daily summary)

- [ ] Message [@BotFather](https://t.me/BotFather) → `/newbot` → follow prompts → get the
      bot token → set `TELEGRAM_BOT_TOKEN`.
- [ ] Send any message to the new bot, then open Settings → Notifications in the app (or
      call `https://api.telegram.org/bot<TOKEN>/getUpdates`) to find the chat ID → set
      `TELEGRAM_CHAT_ID`.
- [ ] Send a test message from Settings to confirm before handing off.

### 5. Google Sheets export (optional)

- [ ] Google Cloud Console → create/select a project → enable the **Google Sheets API**.
- [ ] IAM & Admin → Service Accounts → create a service account → Keys → **Add key → JSON**
      → download it.
- [ ] Minify the downloaded JSON to a single line and set `GOOGLE_SHEETS_SERVICE_ACCOUNT` to
      that string.
- [ ] Create (or use) a Google Sheet for this customer, copy its ID from the URL
      (`.../spreadsheets/d/<THIS PART>/edit`) → set `GOOGLE_SHEET_ID`.
- [ ] **Share the sheet** with the service account's `client_email` (found inside the JSON
      key) — Editor access. Export silently fails if this step is skipped.
- [ ] In the app, Settings → Google Sheets Export → click **Auto-export to Sheets** once to
      create the header row (idempotent, safe to click again later).

### 6. Custom domain (only if the customer gets their own domain/subdomain)

- [ ] Vercel project → Settings → Domains → add the domain.
- [ ] Add the DNS record Vercel shows you (usually a `CNAME` to `cname.vercel-dns.com`, or an
      `A` record to Vercel's IP for an apex domain) at the customer's DNS provider.
- [ ] Once the domain is verified in Vercel, **update the Supabase Site URL + redirect
      allow-list (§1)** to the real domain — a domain added to Vercel after the Supabase
      project was configured is a common way to end up with a stale Site URL.
- [ ] If this customer will get a native Android app (§8), its `capacitor.config.ts`
      `server.url` must point at this final domain — decide the domain **before** building
      the APK, since changing it later requires a full rebuild + reinstall.

### 7. Android app identity (only if this customer gets a white-labeled APK)

Recall: the Android app is a **thin Capacitor shell** whose `server.url`
(`capacitor.config.ts`) is a hardcoded production URL baked in at build time — it is not
runtime-configurable. This means **every customer with their own tablet app needs their own
APK build** regardless of the `appId` decision below; the question is only about the
package identity, not whether a build is needed.

- [ ] **Decide: shared `appId` (`com.baze.pos`) across all customers, or a unique one per
      customer (`com.<product>.pos` pattern, e.g. `com.acmebar.pos`)?**
  - **Recommendation: default to shared**, unless either is true:
    - The customer wants their **own branded app icon/name** distinct from "Baze POS" in
      Android's app drawer/Settings (a shared appId means their tablet literally shows
      "Baze POS" as the installed app name).
    - The app will ever be **submitted to the Google Play Store** — package names must be
      globally unique across the *entire* Play Store, so two customers can't both ship
      `com.baze.pos` there (sideloaded/direct-install APKs, the current model, have no such
      collision constraint since each customer's tablet is a separate physical device).
  - **Changing the appId later is expensive**: Android treats a different `appId` as a
    completely different app — it requires a full uninstall/reinstall, losing the saved
    Bluetooth printer pairing, cached login, and local Preferences. Decide this at
    onboarding, not after the tablet is already in service.
- [ ] If unique: update `appId` and `appName` in `capacitor.config.ts`, `server.url` to the
      customer's domain, re-run `npx cap sync android`, rebuild in Android Studio.

### 8. Handoff

- [ ] Confirm the venue's owner/admin account can log in (Google or email/password) and
      reaches `/auth/setup` → gets approved → lands on `/pos`.
- [ ] Confirm at least one real staff PIN account can be created (Settings → Users) and used
      to log in via the PIN switcher (not the Google/email login — see the identity-base
      note below).
- [ ] Send a live test Telegram/LINE order alert and confirm it arrives.
- [ ] If Bluetooth printer: confirm a real checkout receipt physically prints, with the
      tablet's screen in the foreground the whole time.

---

## Gotchas already hit once — don't re-derive these from scratch

- **`NEXT_PUBLIC_*` vars are inlined at BUILD time, not read at runtime.** If you change one
  in Vercel after the fact, you must trigger a fresh build that does **not** reuse the build
  cache (Vercel dashboard → Deployments → "..." → Redeploy → uncheck "Use existing Build
  Cache"), or the old value keeps shipping even though the dashboard shows the new one. This
  bit the first instance's Supabase URL/anon key more than once. `scripts/provision-new-
  instance.mjs` prints this reminder after pushing env vars for exactly this reason.
- **Supabase Auth redirect URL must be added explicitly per project** (§1 above) — a fresh
  Supabase project does not inherit any allow-list; Google/LINE login will silently fail
  until the exact production `/auth/callback` URL is added.
- **Migration drift**: as of this playbook, five tables the app actually queries at runtime
  (`profiles`, `staff`, `menu_ingredients`, `api_keys`, `webhook_configs`) had been created
  directly on the live Supabase project and were **never captured as a tracked migration** —
  applying only `001`–`004` to a fresh project would look successful and then fail the first
  time someone tries to log in, save a staff PIN, link a recipe ingredient, or use the
  public API/webhooks. This is now fixed with `005_add_profiles_staff_ingredients_apikeys_
  webhooks.sql` — but if you hand-edit the schema directly in the Supabase SQL Editor again
  in the future instead of adding a migration file, you will reintroduce this same gap for
  the next customer. **Always add a new numbered file in `supabase/migrations/` for schema
  changes, never only the SQL Editor.**
- **The POS identity base is the `staff` table (PIN accounts), not the Google/email login.**
  A Google-authenticated user only unlocks the *device*; `AppAuthGuard` deliberately does
  not auto-log them in as the POS operating user (it only bootstraps them in if the `staff`
  table is empty, so a brand-new instance isn't locked out before any staff exist). If a new
  customer instance seems to show the owner's Google account name as the active POS user
  everywhere instead of a staff name, that's expected only until the first real staff
  account is created in Settings → Users — after that, `StaffGate` should always prompt for
  a real staff PIN.
- **`npm run build` passing does not mean a customer's Supabase project is wired up
  correctly** — `src/lib/supabase.ts` and `src/lib/supabase-browser.ts` both fall back to a
  placeholder client (`https://placeholder.supabase.co`) specifically so a missing/invalid
  env var doesn't crash the build. A green build only proves the code compiles; verify the
  actual login flow end-to-end (§8, Handoff) before considering a customer live.
- **A stray `package-lock.json` in the home directory can make Next infer the wrong
  workspace root** when working from a fresh clone — `next.config.ts` already pins
  `turbopack.root` to `__dirname` to guard against this; if a build behaves oddly on a new
  machine with a "wrong root" warning, that's the same class of issue.
