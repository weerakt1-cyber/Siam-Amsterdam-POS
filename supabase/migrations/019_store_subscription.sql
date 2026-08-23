-- ─── Per-store subscription (Phase 0: manual billing) ───────────────────────
-- Tracks each store's package + expiry so the POS can show a soft renewal
-- banner. NO automated payment yet — the owner collects payment out-of-band
-- (PromptPay / bank transfer) and updates subscription_until by hand:
--   update stores set subscription_status='active',
--          subscription_until='2026-12-31' where id='<store-id>';
-- Nothing enforces access on expiry in this phase (banner only). Idempotent.

alter table stores add column if not exists plan                text not null default 'starter';
alter table stores add column if not exists subscription_status text not null default 'trial';   -- trial | active | expired
alter table stores add column if not exists subscription_until  date;
