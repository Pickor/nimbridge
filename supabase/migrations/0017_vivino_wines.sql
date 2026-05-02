-- ── Vivino wine ratings integration ───────────────────────────────────────
-- Stores a local cache of Vivino wine data to enable fuzzy-name matching
-- against Catawiki lot titles (wine & champagne categories only).

-- Trigram extension for fuzzy text similarity
create extension if not exists pg_trgm;

-- ── vivino_wines: cache of wine ratings from Vivino ────────────────────────
create table vivino_wines (
  vivino_vintage_id     bigint      primary key,
  vivino_wine_id        bigint      not null,
  vintage_name          text        not null,   -- e.g. "Bollinger Special Cuvée Brut Champagne NV"
  wine_name             text        not null,   -- e.g. "Special Cuvée Brut"
  seo_name              text,                   -- e.g. "bollinger-special-cuvee-brut-champagne"
  wine_type_id          smallint    not null,   -- 1=Red, 2=White, 3=Champagne, 24=Port/Fortified
  ratings_average       numeric(3,2),           -- vintage-level (1–5 scale)
  ratings_count         integer     default 0,
  wine_ratings_average  numeric(3,2),           -- wine-level (more reviews)
  wine_ratings_count    integer     default 0,
  fetched_at            timestamptz default now()
);

-- Trigram index for fast fuzzy wine name search
create index vivino_wines_name_trgm
  on vivino_wines using gin (vintage_name gin_trgm_ops);

create index vivino_wines_type
  on vivino_wines (wine_type_id);

-- RLS: any authenticated user can read (no write from client side)
alter table vivino_wines enable row level security;
create policy "vivino_wines read authed" on vivino_wines
  for select using (auth.role() = 'authenticated');

-- ── Add Vivino rating columns to listings ──────────────────────────────────
alter table listings
  add column if not exists vivino_vintage_id   bigint,
  add column if not exists vivino_rating_avg   numeric(3,2),
  add column if not exists vivino_rating_count integer;

-- ── Add Vivino rating columns to auction_results ───────────────────────────
alter table auction_results
  add column if not exists vivino_vintage_id   bigint,
  add column if not exists vivino_rating_avg   numeric(3,2),
  add column if not exists vivino_rating_count integer;

-- ── Fuzzy wine matching function ───────────────────────────────────────────
-- Finds the best matching Vivino wine for a cleaned lot title.
-- Returns 0 rows if the vivino_wines table is empty.
create or replace function match_vivino_wine(
  p_title     text,
  p_type_ids  smallint[]
)
returns table (
  vivino_vintage_id   bigint,
  vintage_name        text,
  ratings_average     numeric,
  ratings_count       integer,
  sim                 real
)
language sql stable as $$
  select
    vw.vivino_vintage_id,
    vw.vintage_name,
    vw.ratings_average,
    vw.ratings_count,
    similarity(vw.vintage_name, p_title) as sim
  from vivino_wines vw
  where vw.wine_type_id = any(p_type_ids)
    and vw.ratings_count >= 5
  order by similarity(vw.vintage_name, p_title) desc
  limit 1;
$$;

-- ── Recreate v_classified_listings to include Vivino columns ───────────────
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
  l.vivino_rating_avg,
  l.vivino_rating_count,
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
