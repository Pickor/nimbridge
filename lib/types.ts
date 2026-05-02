/**
 * Shared TypeScript types mirroring the Postgres schema.
 *
 * `Listing` matches `listings` (active auctions only, post migration 0015).
 * `ClassifiedListing` adds the computed columns from `v_classified_listings`.
 * `HistoryListing` matches `auction_results` (closed auctions, archived).
 *
 * When a column is added to listings/auction_results, mirror it here too,
 * otherwise TypeScript will silently let you read `undefined` from the DB.
 */
export type PriceBucket = "low" | "good" | "ok" | null;
export type LotOutcome = "sold" | "not_sold" | "no_bids" | null;

export interface Listing {
  id: string;
  catawiki_id: string;
  url: string;
  title: string;
  image_url: string | null;
  category: string;
  current_bid: number | null;
  currency: string;
  estimated_low: number | null;
  estimated_high: number | null;
  bid_count: number;
  unique_bidders: number | null;
  lot_outcome: LotOutcome;
  ends_at: string;
  seller: string | null;
  /** Seller's country — ISO-2 code (e.g. "FR") or free-text country name. */
  seller_country: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  catawiki_category_id: number | null;
  catawiki_subcategory_id: number | null;
  shipping_cost_eur: number | null;
  specifications: Array<{ name: string; value: string }> | null;
  final_price: number | null;
  sb_product_id: string | null;
  sb_price: number | null;           // SEK retail price at Systembolaget
  vivino_rating_avg: number | null;  // Vivino score 1–5 (wine & champagne only)
  vivino_rating_count: number | null;
  cellartracker_score: number | null; // CT community avg 70–100 (wine & champagne only)
}

export interface ClassifiedListing extends Listing {
  price_bucket: PriceBucket;
  ending_soon_no_bids: boolean;
  overpriced: boolean;
  last_auction_price: number | null;
  last_auction_ended_at: string | null;
}

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

// Permanent record of a closed auction, stored in auction_results
export interface HistoryListing {
  id: string;
  catawiki_id: string;
  url: string;
  title: string;
  image_url: string | null;
  final_price: number;         // always set — required for auction_results
  bid_count: number;
  unique_bidders: number | null;
  lot_outcome: LotOutcome;
  estimated_low: number | null;
  estimated_high: number | null;
  shipping_cost_eur: number | null;
  catawiki_category_id: number | null;
  catawiki_subcategory_id: number | null;
  seller_country: string | null;
  sb_price: number | null;
  sb_product_id: string | null;
  vivino_rating_avg: number | null;
  vivino_rating_count: number | null;
  cellartracker_score: number | null;
  ends_at: string;
  recorded_at: string;
}

export interface UserSettings {
  currency: string;      // e.g. "SEK", "EUR", "USD", "GBP"
  country_code: string;  // e.g. "se", "de", "gb"
}

export const DEFAULT_SETTINGS: UserSettings = {
  currency: "SEK",
  country_code: "se",
};

export interface BucketData {
  ending_soon: ClassifiedListing[];
  low_price:   ClassifiedListing[];
  good_price:  ClassifiedListing[];
  ok_price:    ClassifiedListing[];
  overpriced:  ClassifiedListing[];
  rest:        ClassifiedListing[]; // active lots that don't fit any price bucket
}
