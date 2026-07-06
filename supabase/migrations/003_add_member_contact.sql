-- ============================================================
-- Siam Amsterdam POS — Add contact to members
-- Optional secondary contact (email, LINE ID, social handle) for
-- promotions/birthday outreach, separate from the phone field.
-- Run once in Supabase SQL Editor
-- ============================================================

alter table members add column if not exists contact text;
