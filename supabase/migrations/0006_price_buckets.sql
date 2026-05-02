-- Add 'low' price bucket (bid ≤ 50% of estimate) and adjust 'good' to 50–70%
drop view if exists v_classified_listings;

create view v_classified_listings as
select
  id,
  catawiki_id,
  url,
  title,
  image_url,
  category,
  current_bid,
  currency,
  estimated_low,
  estimated_high,
  bid_count,
  ends_at,
  seller,
  first_seen_at,
  last_seen_at,
  is_active,
  catawiki_category_id,
  catawiki_subcategory_id,
  case
    when estimated_low is null or current_bid is null then null
    when current_bid <= 0.50 * estimated_low then 'low'
    when current_bid <= 0.70 * estimated_low then 'good'
    when current_bid <= 0.90 * estimated_low then 'ok'
    else null
  end as price_bucket,
  bid_count = 0 and ends_at <= now() + interval '6 hours' as ending_soon_no_bids,
  (estimated_high is not null and current_bid is not null and bid_count > 0
   and current_bid > 1.15 * estimated_high) as overpriced
from listings l
where is_active = true and ends_at > now();
