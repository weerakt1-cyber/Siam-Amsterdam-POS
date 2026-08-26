// @baze/db — best-effort operator notifications via Telegram.
//
// Set two env vars on the app that sends (e.g. apps/affiliate):
//   TELEGRAM_BOT_TOKEN  — from @BotFather (create a bot → copy the token)
//   TELEGRAM_CHAT_ID    — your own chat/group id (message the bot once, then read
//                         https://api.telegram.org/bot<token>/getUpdates → chat.id)
// Optional:
//   ADMIN_URL           — admin console origin, appended as an "approve here" link
//
// No-op unless both token + chat id are set, and NEVER throws — a failed
// notification must not break the action that triggered it. Plain text (no
// parse_mode) so user-supplied values need no escaping.
export async function notifyAdmin(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    })
    if (!res.ok) console.error('[notifyAdmin] telegram', res.status, await res.text().catch(() => ''))
  } catch (err) {
    console.error('[notifyAdmin]', err instanceof Error ? err.message : err)
  }
}

// The admin console origin (for "approve here" links), trailing slash trimmed.
export function adminUrl(): string {
  return (process.env.ADMIN_URL || '').replace(/\/$/, '')
}
