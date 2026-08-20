-- ─── Reservation cancellation reason ────────────────────────────────────────
-- When a customer cancels their booking on the /reserve tracking page they can
-- leave a short reason so the shop knows why (shown on the POS Bookings card).
-- Idempotent.
alter table reservations add column if not exists cancel_reason text;
