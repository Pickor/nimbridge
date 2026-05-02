-- Capture seller's country on each lot so the dashboard can offer
-- "Ships from EU / Outside EU" filtering. Populated by the next scraper
-- pass (catawiki.ts now reads sellerInfo.country / countryCode and
-- upsert.ts threads it through).
--
-- Already applied directly on production via Management API on
-- 2026-05-02; this file just records the change.

alter table public.listings        add column if not exists seller_country text;
alter table public.auction_results add column if not exists seller_country text;

create index if not exists listings_seller_country_idx        on public.listings        (seller_country);
create index if not exists auction_results_seller_country_idx on public.auction_results (seller_country);

create or replace view public.v_classified_listings as
select
    l.id, l.catawiki_id, l.url, l.title, l.image_url, l.category,
    l.current_bid, l.currency, l.estimated_low, l.estimated_high,
    l.bid_count, l.unique_bidders, l.lot_outcome, l.ends_at, l.seller,
    l.first_seen_at, l.last_seen_at, l.is_active,
    l.catawiki_category_id, l.catawiki_subcategory_id,
    l.shipping_cost_eur, l.sb_price, l.sb_product_id, l.final_price,
    l.vivino_rating_avg, l.vivino_rating_count, l.cellartracker_score,
    hist.final_price as last_auction_price,
    hist.ends_at    as last_auction_ended_at,
    case
        when l.estimated_low is null or l.current_bid is null then null::text
        when l.current_bid <= (0.50 * l.estimated_low) then 'low'::text
        when l.current_bid <= (0.70 * l.estimated_low) then 'good'::text
        when l.current_bid <= (0.90 * l.estimated_low) then 'ok'::text
        else null::text
    end as price_bucket,
    l.bid_count = 0 and l.ends_at <= (now() + interval '6 hours')      as ending_soon_no_bids,
    l.estimated_high is not null and l.current_bid is not null
        and l.bid_count > 0 and l.current_bid > (1.15 * l.estimated_high) as overpriced,
    l.specifications,
    l.seller_country
from listings l
left join lateral (
    select h.final_price, h.ends_at
    from auction_results h
    where lower(h.title) = lower(l.title)
    order by h.ends_at desc
    limit 1
) hist on true
where l.is_active = true and l.ends_at > now();

grant select on public.v_classified_listings to authenticated, service_role;
revoke all  on public.v_classified_listings from anon;
