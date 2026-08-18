-- ─── Link a QR order to a member + points-award idempotency ──────────────────
-- When a customer enters their phone on the QR order page, the order is linked
-- to their member record (member_id). Points are auto-awarded once the order is
-- marked paid; points_awarded guards against double-awarding on repeated PATCH.
-- Idempotent.
alter table orders add column if not exists member_id      text;
alter table orders add column if not exists points_awarded boolean not null default false;
