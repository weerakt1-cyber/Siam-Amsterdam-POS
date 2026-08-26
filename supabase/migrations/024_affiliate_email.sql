-- ─── Affiliate login email (M3c) ────────────────────────────────────────────
-- The affiliate portal (apps/affiliate) authenticates a broker via Supabase
-- (Google) and maps the verified email to their affiliate record. Store it
-- lowercased; lookup is case-insensitive. Idempotent.

alter table affiliates add column if not exists email text;
create index if not exists idx_affiliates_email on affiliates (email);
