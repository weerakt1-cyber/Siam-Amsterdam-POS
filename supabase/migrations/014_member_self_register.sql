-- ─── Member self-registration metadata ──────────────────────────────────────
-- Public sign-up page lets customers register themselves. Record how a member
-- was created (source) and when they gave consent (consent_at, PDPA), so the
-- venue can demonstrate consent for the personal data it holds.
-- Idempotent.
alter table members add column if not exists source     text;
alter table members add column if not exists consent_at timestamptz;
