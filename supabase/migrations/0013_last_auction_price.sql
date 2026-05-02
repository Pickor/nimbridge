-- Add fast title-lookup index for last-auction-price lateral join
create index if not exists listings_title_lower_idx
  on listings (lower(title));

create index if not exists listings_history_lookup_idx
  on listings (lower(title), ends_at desc)
  where is_active = false and final_price is not null;

-- Recreate view: add last_auction_price + last_auction_ended_at via lateral join
-- Also adds missing columns: unique_bidders, lot_outcome, final_price
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
  -- Last historical auction for the same product (exact title match)
  hist.final_price      as last_auction_price,
  hist.ends_at          as last_auction_ended_at,
  -- Computed price bucket
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
  from   listings h
  where  h.is_active = false
    and  h.final_price is not null
    and  h.catawiki_id <> l.catawiki_id
    and  lower(h.title) = lower(l.title)
  order  by h.ends_at desc
  limit  1
) hist on true
where l.is_active = true and l.ends_at > now();
