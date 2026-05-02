-- Add category tracking columns so scraped lots are tagged by Catawiki category/subcategory
alter table listings
  add column if not exists catawiki_category_id integer,
  add column if not exists catawiki_subcategory_id integer;

create index if not exists listings_category_idx
  on listings (catawiki_category_id);
