-- profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- listings: shared, upserted by scraper on catawiki_id
create table listings (
  id uuid primary key default gen_random_uuid(),
  catawiki_id text unique not null,
  url text not null,
  title text not null,
  image_url text,
  category text not null default 'wine-whisky-spirits',
  current_bid numeric(12,2),
  currency text not null default 'EUR',
  estimated_low numeric(12,2),
  estimated_high numeric(12,2),
  bid_count integer not null default 0,
  ends_at timestamptz not null,
  seller text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true
);
create index on listings (ends_at);
create index on listings (is_active, ends_at);

-- bid history snapshots (one row per scrape per listing)
create table listing_snapshots (
  id bigserial primary key,
  listing_id uuid not null references listings(id) on delete cascade,
  current_bid numeric(12,2),
  bid_count integer not null,
  scraped_at timestamptz not null default now()
);
create index on listing_snapshots (listing_id, scraped_at desc);

-- per-user favorites
create table favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, listing_id)
);

-- classified view used by the UI
create view v_classified_listings as
select
  l.*,
  case
    when l.estimated_low is null or l.current_bid is null then null
    when l.current_bid <= 0.70 * l.estimated_low then 'good'
    when l.current_bid <= 0.90 * l.estimated_low then 'ok'
    else null
  end as price_bucket,
  (l.bid_count = 0 and l.ends_at <= now() + interval '6 hours') as ending_soon_no_bids
from listings l
where l.is_active = true and l.ends_at > now();

-- RLS
alter table profiles enable row level security;
alter table listings enable row level security;
alter table listing_snapshots enable row level security;
alter table favorites enable row level security;

create policy "profiles self" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "listings read for authed" on listings
  for select using (auth.role() = 'authenticated');

create policy "snapshots read for authed" on listing_snapshots
  for select using (auth.role() = 'authenticated');

create policy "favorites self" on favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- auto-create profile on signup
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
