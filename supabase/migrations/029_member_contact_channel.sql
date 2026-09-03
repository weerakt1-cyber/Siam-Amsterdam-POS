-- ─── Structured promo contact channel on members ────────────────────────────
-- The signup form lets a customer opt into LINE / Telegram / WhatsApp and give
-- their handle. Migration 003 added a free-text `contact` column (kept for a
-- human-readable "LINE: @handle" display); these two columns store the same
-- thing in a machine-readable shape so the store can later broadcast promos to
-- everyone on a given channel (e.g. all LINE members). Both nullable, idempotent.

alter table members add column if not exists contact_channel text;
alter table members add column if not exists contact_id      text;

-- Only the three supported channels (or null). Guarded so re-running is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'members_contact_channel_check'
  ) then
    alter table members add constraint members_contact_channel_check
      check (contact_channel is null or contact_channel in ('line','telegram','whatsapp'));
  end if;
end $$;

-- Broadcast lookup: "every member on channel X in this store".
create index if not exists idx_members_store_contact_channel
  on members(store_id, contact_channel) where contact_channel is not null;
