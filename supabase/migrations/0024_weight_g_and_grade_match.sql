-- weight_g column on listings + auction_results, populated by the
-- scraper at upsert/archive time so we can offer Grade+Weight matching
-- for jewellery later without regex-scanning titles at query time.
-- Backfilled from title text and (for listings only) from the
-- specifications JSONB.
--
-- NOTE: v_classified_listings still uses the simple lower(title) match
-- for last_auction_price across all verticals. A grade-aware variant
-- existed briefly but was reverted because it caused the lateral join
-- to be too slow on Supabase Free tier. Future work: do the
-- grade-aware match SSR-side in the jewellery dashboard pages instead
-- of inside the view.

alter table public.listings        add column if not exists weight_g numeric;
alter table public.auction_results add column if not exists weight_g numeric;

create index if not exists listings_weight_g_idx
  on public.listings(weight_g) where weight_g is not null;
create index if not exists auction_results_weight_g_idx
  on public.auction_results(weight_g) where weight_g is not null;

-- Backfill from title (any vertical that uses "X.X g" in the title).
update public.listings
  set weight_g = coalesce(weight_g, nullif(replace(substring(title from
       '([0-9]+(?:[.,][0-9]+)?)\s*g(?:[^a-zA-Z]|$)'), ',', '.'), '')::numeric);
update public.auction_results
  set weight_g = coalesce(weight_g, nullif(replace(substring(title from
       '([0-9]+(?:[.,][0-9]+)?)\s*g(?:[^a-zA-Z]|$)'), ',', '.'), '')::numeric);

-- Backfill listings from any Catawiki spec row whose name looks weight-y.
-- (auction_results doesn't store specifications, so no equivalent there;
-- historical archived rows without weight in their title stay NULL.)
update public.listings l
   set weight_g = (
     select nullif(replace(substring(s->>'value' from
       '([0-9]+(?:[.,][0-9]+)?)\s*g'), ',', '.'), '')::numeric
     from jsonb_array_elements(l.specifications) s
     where lower(s->>'name') like '%weight%' or lower(s->>'name') like '%vikt%'
        or lower(s->>'name') like '%gewicht%' or lower(s->>'name') like '%poids%'
        or lower(s->>'name') like '%peso%'
     limit 1
   )
 where l.weight_g is null and l.specifications is not null;

-- View intentionally NOT modified here — see commit 33c05c0 + the
-- subsequent revert for context.
