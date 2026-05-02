-- 0020_cellartracker.sql
-- Add CellarTracker community-average score (typically 70–100, e.g. 91.4)
-- to listings + auction_results. Populated by a local backfill script that
-- attaches via CDP to a manually-launched Chrome (CellarTracker is behind
-- AWS WAF and rejects automated traffic from anywhere else).

alter table listings
  add column if not exists cellartracker_score numeric(4,1);

alter table auction_results
  add column if not exists cellartracker_score numeric(4,1);

-- Surface the column on the dashboard view so UI components can read it.
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
  l.cellartracker_score,
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
