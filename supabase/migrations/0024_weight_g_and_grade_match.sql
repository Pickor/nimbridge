-- weight_g column on listings + auction_results so the dashboard's
-- "last price" lookup can match jewellery on parsed Grade + Weight
-- without having to regex-scan titles at query time. Backfilled from
-- title text and (for listings only) from the specifications JSONB.
--
-- v_classified_listings.last_auction_price now uses:
--   wine/watches/etc.  -> exact lower(title) match (unchanged)
--   gold (313/1660)    -> same karat (regex on title) AND same weight_g
--   silver (313/841)   -> same purity AND same weight_g
--   diamonds (715)     -> same clarity AND overlapping shape word

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

-- View update: re-create with grade-aware lateral join. See git history
-- for the full SQL (committed via Management API on 2026-05-02).
