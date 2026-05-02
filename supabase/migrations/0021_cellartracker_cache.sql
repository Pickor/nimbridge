-- 0021_cellartracker_cache.sql
-- Persistent CellarTracker search cache. Keyed by the cleaned title we
-- send to CT's search endpoint, so every unique wine gets searched on
-- CT at most once. A NULL score means "searched but no match" — a
-- tombstone — so we don't keep re-searching dead-end queries.

create table cellartracker_searches (
  cleaned_title text          primary key,
  score         numeric(4,1),               -- null = searched, no match
  searched_at   timestamptz not null default now()
);

create index cellartracker_searches_score_idx
  on cellartracker_searches (score) where score is not null;

alter table cellartracker_searches enable row level security;

-- Service role only: populated by the local backfill script (CDP-attached
-- Chrome) and by the daily scraper. No client read access.
create policy "ct_searches_no_direct_access"
  on cellartracker_searches
  using (false);
