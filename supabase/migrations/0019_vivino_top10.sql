-- 0019_vivino_top10.sql
-- match_vivino_wine() returned only the single best trigram match, which
-- meant we got false positives whenever the real wine wasn't in the cache
-- (the function would return the nearest neighbour regardless of how
-- different it was). We now return the top 10 candidates so the application
-- layer can post-filter (e.g. require the producer name to appear in the
-- Vivino vintage_name) before accepting a match.

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
  limit 50;
$$;
