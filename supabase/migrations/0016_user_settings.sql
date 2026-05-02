create table user_settings (
  user_id      uuid        primary key references auth.users(id) on delete cascade,
  currency     text        not null default 'SEK',
  country_code text        not null default 'se',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table user_settings enable row level security;

create policy "user_settings self" on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
