-- Recreate v_classified_listings to include catawiki_category_id and catawiki_subcategory_id
-- added in migration 0003. CREATE OR REPLACE cannot reorder columns, so drop + recreate.
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
    when current_bid <= 0.70 * estimated_low then 'good'
    when current_bid <= 0.90 * estimated_low then 'ok'
    else null
  end as price_bucket,
  bid_count = 0 and ends_at <= now() + interval '6 hours' as ending_soon_no_bids
from listings l
where is_active = true and ends_at > now();
