-- ============================================================
-- Baze POS — Menu categories (shared across POS + QR ordering)
-- Previously stored only in the staff POS device's localStorage, which
-- meant a customer's phone (QR ordering) could never see categories
-- added/edited/reordered on the POS tablet. Moving to a real table so
-- every surface reads the same data.
-- Run once in Supabase SQL Editor
-- ============================================================

create table if not exists categories (
  value       text primary key,
  label       text not null,
  color       text not null default '',
  icon        text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- New tables get RLS enabled by default with no policies, which blocks the
-- anon key entirely. This app enforces access control at the Next.js API
-- route layer, not Postgres RLS — matching every other table in this schema.
alter table categories disable row level security;
