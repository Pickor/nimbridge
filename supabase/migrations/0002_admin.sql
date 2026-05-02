-- is_banned flag on profiles
alter table profiles add column if not exists is_banned boolean not null default false;

-- user_roles: exactly one role per user (owner is derived from OWNER_EMAIL env var, not stored)
create table user_roles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  role      text not null check (role in ('admin', 'moderator', 'user')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id)
);

-- All user_roles access goes through service role — no direct client access
alter table user_roles enable row level security;
create policy "no direct access" on user_roles using (false);

-- scraper_runs: one row per scraper invocation, readable by authenticated users
create table scraper_runs (
  id                   bigserial primary key,
  ran_at               timestamptz not null default now(),
  lots_found           integer not null default 0,
  lots_scraped         integer not null default 0,
  lots_upserted        integer not null default 0,
  lots_skipped         integer not null default 0,
  lots_marked_inactive integer not null default 0,
  duration_ms          integer
);

alter table scraper_runs enable row level security;
create policy "scraper_runs read for authed" on scraper_runs
  for select using (auth.role() = 'authenticated');

-- Update handle_new_user to also auto-grant 'user' role on signup
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

  insert into user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

  return new;
end $$;
