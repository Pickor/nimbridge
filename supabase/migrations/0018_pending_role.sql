-- 0018_pending_role.sql
-- New SSO sign-ins are assigned 'pending' so they cannot access the dashboard
-- until an admin promotes them to 'user', 'moderator', or 'admin' in /admin/users.

-- 1. Widen the CHECK constraint to allow 'pending' as a valid role value.
alter table user_roles drop constraint if exists user_roles_role_check;
alter table user_roles
  add constraint user_roles_role_check
  check (role in ('admin', 'moderator', 'user', 'pending'));

-- 2. Replace handle_new_user() so new sign-ups start as 'pending'
--    instead of immediately receiving full 'user' (dashboard) access.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  -- 'pending' blocks dashboard access until an admin assigns a real role.
  insert into user_roles (user_id, role)
  values (new.id, 'pending')
  on conflict (user_id) do nothing;

  return new;
end $$;
