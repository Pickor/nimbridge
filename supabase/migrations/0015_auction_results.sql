-- ── auction_results: permanent record of every closed auction ─────────────
-- Each closed auction gets its own UUID here. The listings table becomes
-- active-only; entries are deleted from listings when they close.

create table auction_results (
  id                      uuid          primary key default gen_random_uuid(),
  catawiki_id             text          not null unique,
  url                     text          not null,
  title                   text          not null,
  image_url               text,
  final_price             numeric(12,2) not null,
  bid_count               integer       not null default 0,
  unique_bidders          integer,
  lot_outcome             text,
  estimated_low           numeric(12,2),
  estimated_high          numeric(12,2),
  shipping_cost_eur       numeric(12,2),
  catawiki_category_id    integer,
  catawiki_subcategory_id integer,
  sb_price                numeric(12,2),
  sb_product_id           text,
  ends_at                 timestamptz   not null,
  recorded_at             timestamptz   not null default now()
);

-- Fast history queries
create index auction_results_ends_at_idx
  on auction_results (ends_at desc);

-- Fast lateral join from v_classified_listings (replaces old listings_history_lookup_idx)
create index auction_results_title_ends_idx
  on auction_results (lower(title), ends_at desc);

-- RLS: authenticated users can read
alter table auction_results enable row level security;

create policy "auction_results read for authed" on auction_results
  for select using (auth.role() = 'authenticated');

-- ── Migrate existing history out of listings ───────────────────────────────
insert into auction_results (
  catawiki_id, url, title, image_url, final_price, bid_count, unique_bidders,
  lot_outcome, estimated_low, estimated_high, shipping_cost_eur,
  catawiki_category_id, catawiki_subcategory_id, sb_price, sb_product_id, ends_at
)
select
  catawiki_id, url, title, image_url, final_price, bid_count, unique_bidders,
  lot_outcome, estimated_low, estimated_high, shipping_cost_eur,
  catawiki_category_id, catawiki_subcategory_id, sb_price, sb_product_id, ends_at
from listings
where is_active = false
  and final_price is not null
on conflict (catawiki_id) do nothing;

-- ── Remove inactive rows from listings (it's now active-only) ─────────────
-- Cascade deletes listing_snapshots and favorites for those rows.
delete from listings where is_active = false;

-- Drop the old partial index that targeted inactive listings
drop index if exists listings_history_lookup_idx;

-- ── Recreate v_classified_listings with lateral join → auction_results ─────
drop view if exists v_classified_listings;

create view v_classified_listings as
select
  l.id,
  l.catawiki_id,
  l.url,
  l.title,
  l.image_url,
  l.category,
  l.current_bid,
  l.currency,
  l.estimated_low,
  l.estimated_high,
  l.bid_count,
  l.unique_bidders,
  l.lot_outcome,
  l.ends_at,
  l.seller,
  l.first_seen_at,
  l.last_seen_at,
  l.is_active,
  l.catawiki_category_id,
  l.catawiki_subcategory_id,
  l.shipping_cost_eur,
  l.sb_price,
  l.sb_product_id,
  l.final_price,
  -- Most recent closed auction for the same product title
  hist.final_price  as last_auction_price,
  hist.ends_at      as last_auction_ended_at,
  -- Price bucket
  case
    when l.estimated_low is null or l.current_bid is null then null
    when l.current_bid <= 0.50 * l.estimated_low then 'low'
    when l.current_bid <= 0.70 * l.estimated_low then 'good'
    when l.current_bid <= 0.90 * l.estimated_low then 'ok'
    else null
  end as price_bucket,
  l.bid_count = 0 and l.ends_at <= now() + interval '6 hours' as ending_soon_no_bids,
  (l.estimated_high is not null and l.current_bid is not null and l.bid_count > 0
   and l.current_bid > 1.15 * l.estimated_high) as overpriced
from listings l
left join lateral (
  select h.final_price, h.ends_at
  from   auction_results h
  where  lower(h.title) = lower(l.title)
  order  by h.ends_at desc
  limit  1
) hist on true
where l.is_active = true and l.ends_at > now();
