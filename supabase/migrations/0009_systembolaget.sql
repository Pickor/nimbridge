-- Systembolaget product catalogue
create table if not exists systembolaget_products (
  id              text primary key,          -- productId (e.g. "27400611")
  name_bold       text not null,             -- productNameBold (brand / main name)
  name_thin       text,                      -- productNameThin (variant / age)
  price           numeric(10,2) not null,    -- price in SEK (e.g. 459.90)
  volume          int,                       -- volume in ml
  category        text,                      -- categoryLevel1 (e.g. "Sprit", "Vin")
  subcategory     text,                      -- categoryLevel2
  country         text,
  producer        text,
  alcohol_pct     numeric(5,2),
  vintage         int,
  product_number  text,                      -- productNumber (article number)
  image_url       text,
  is_out_of_stock boolean default false,
  updated_at      timestamptz default now()
);

-- Enable trigram extension for fuzzy matching (already available on Supabase)
create extension if not exists pg_trgm;

-- Index: trigram similarity on full name for fast fuzzy queries
create index if not exists sb_products_name_trgm_idx
  on systembolaget_products
  using gin ((lower(name_bold || ' ' || coalesce(name_thin, ''))) gin_trgm_ops);

-- Index: category filter
create index if not exists sb_products_category_idx
  on systembolaget_products (category);
