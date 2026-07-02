-- ============================================================
-- Siam Amsterdam POS — Add customer_name to orders
-- Captures the customer's name entered on the QR ordering flow
-- Run once in Supabase SQL Editor
-- ============================================================

alter table orders add column if not exists customer_name text;
