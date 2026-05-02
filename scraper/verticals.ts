/**
 * Top-level vertical that a Catawiki category belongs to.
 *
 * Stored on every listings/auction_results row in the existing `category`
 * text column so the dashboard can filter by vertical (Wine & Spirits /
 * Jewellery / Watches / Apple).
 *
 * Looked up by *top-level* catawiki_category_id — even when scraping a
 * subcategory (e.g. 1660 Gold), upsert.ts records the parent (313) on
 * the row, so the lookup matches.
 */

export type Vertical = "wine-whisky-spirits" | "jewellery" | "watches" | "apple";

const VERTICAL_BY_CATEGORY: Record<number, Vertical> = {
  // ── Wine & Spirits ──────────────────────────────────────────────────────
  437: "wine-whisky-spirits", // Whisky
  443: "wine-whisky-spirits", // Wine
  961: "wine-whisky-spirits", // Champagne
  963: "wine-whisky-spirits", // Beer
  965: "wine-whisky-spirits", // Rum, Cognac & Fine Spirits
  971: "wine-whisky-spirits", // Port & Sweet Wines

  // ── Jewellery ───────────────────────────────────────────────────────────
  715: "jewellery", // Diamonds (own top-level on catawiki)
  313: "jewellery", // Jewellery main category (Gold/Silver are subcats)

  // ── Watches ─────────────────────────────────────────────────────────────
  333: "watches",   // Watches main category (Rolex/Omega are subcats)

  // Apple lots come from full-text search, not a fixed category — handled
  // separately in the search-based scraper, not via this map.
};

export function verticalOfCategory(categoryId: number | null | undefined): Vertical {
  if (!categoryId) return "wine-whisky-spirits";
  return VERTICAL_BY_CATEGORY[categoryId] ?? "wine-whisky-spirits";
}
