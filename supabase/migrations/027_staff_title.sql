-- Custom position titles for staff. `role` stays the fixed access level
-- (admin | manager | staff | bartender) that drives permissions; `title` is a
-- free-text position name shown in the UI ("หัวหน้าบาร์", "แคชเชียร์", "DJ", …),
-- so a shop can have unlimited positions without changing the permission model.
-- Existing rows keep title = NULL and fall back to the access-level label.
alter table staff add column if not exists title text;

select 'staff.title added ✓' as result;
