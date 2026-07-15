-- Generic server-side key/value config store. First use: Omise payment keys,
-- so they can be entered in Settings → Payment instead of Vercel env vars. The
-- secret key must live server-side (the browser must never see it), so a
-- localStorage/BarSettings approach won't work — hence this table.
create table if not exists app_config (
  key        text        primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table app_config disable row level security;
