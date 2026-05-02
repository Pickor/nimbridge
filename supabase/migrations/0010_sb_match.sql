-- Add Systembolaget match columns to listings
alter table listings
  add column if not exists sb_product_id text references systembolaget_products(id),
  add column if not exists sb_price      numeric(10,2);  -- SEK, denormalised copy for fast reads

create index if not exists listings_sb_product_idx on listings (sb_product_id);
