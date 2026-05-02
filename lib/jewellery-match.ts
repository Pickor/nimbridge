/**
 * SSR-side last-price match for jewellery lots.
 *
 * The shared v_classified_listings view matches by exact lower(title)
 * across all verticals — that's accurate for wine but bad for jewellery
 * (most gold/silver titles don't include the weight, and diamonds with
 * the same Shape/Clarity have different titles).
 *
 * Instead of overloading the view (which made the lateral join too
 * slow on Supabase Free), we override last_auction_price + ended_at
 * for jewellery rows here, server-side, after the SSR query has loaded
 * both the active listings and a small set of jewellery auction_results.
 *
 * Match keys, per material:
 *   Diamonds (cat 715)        →  shape + clarity
 *   Gold     (cat 313/1660)   →  karat + weight_g
 *   Silver   (cat 313/841)    →  purity + weight_g
 *   Anything else             →  no match (null key)
 *
 * Lots whose key can't be computed (e.g. gold with no weight in title
 * or specs) keep whatever the view computed via title-match. So this is
 * always at least as good as before.
 */

import type { ClassifiedListing, HistoryListing } from "@/lib/types";
import {
  parseDiamondGrade,
  parseGoldKarat,
  parseSilverPurity,
} from "@/lib/jewellery-value";

type WithMaterialFields = {
  title: string;
  catawiki_category_id: number | null;
  catawiki_subcategory_id: number | null;
  weight_g: number | null;
};

/** Returns a stable string key for matching, or null when the lot's
 *  material can't be graded with what we have. */
function matchKey(l: WithMaterialFields): string | null {
  // Diamond
  if (l.catawiki_category_id === 715) {
    const g = parseDiamondGrade(l.title);
    if (!g) return null;
    return `D:${g.shape}:${g.clarity}`;
  }
  // Gold (subcategory 1660 of jewellery 313)
  if (l.catawiki_subcategory_id === 1660) {
    const k = parseGoldKarat(l.title);
    if (!k || l.weight_g == null) return null;
    return `G:${k}:${l.weight_g}`;
  }
  // Silver (subcategory 841)
  if (l.catawiki_subcategory_id === 841) {
    const p = parseSilverPurity(l.title);
    if (!p || l.weight_g == null) return null;
    return `S:${p}:${l.weight_g}`;
  }
  return null;
}

/**
 * Override last_auction_price + last_auction_ended_at on each jewellery
 * listing using a grade-aware match against the supplied set of jewellery
 * auction_results. Returns a NEW array; original objects are not mutated.
 */
export function enrichJewelleryLastPrices(
  listings: ClassifiedListing[],
  archives: HistoryListing[],
): ClassifiedListing[] {
  // Build key -> most-recent archive map. Sort archives by ends_at desc
  // first so the first put per key wins.
  const byKey = new Map<string, { final_price: number; ends_at: string }>();
  const sorted = [...archives].sort((a, b) => b.ends_at.localeCompare(a.ends_at));
  for (const a of sorted) {
    const k = matchKey(a);
    if (!k) continue;
    if (!byKey.has(k)) {
      byKey.set(k, { final_price: a.final_price, ends_at: a.ends_at });
    }
  }

  return listings.map((l) => {
    const k = matchKey(l);
    if (!k) return l; // keep view's title-match value
    const hit = byKey.get(k);
    if (!hit) {
      // No grade-match available — null out so we don't show a stale
      // title-matched value that's almost certainly the wrong grade.
      return { ...l, last_auction_price: null, last_auction_ended_at: null };
    }
    return {
      ...l,
      last_auction_price: hit.final_price,
      last_auction_ended_at: hit.ends_at,
    };
  });
}

/** Same enrichment applied to a fresh BucketData payload (rebuckets after match). */
import type { BucketData } from "@/lib/types";
export function enrichJewelleryBuckets(
  buckets: BucketData,
  archives: HistoryListing[],
): BucketData {
  const all = [
    ...buckets.ending_soon,
    ...buckets.low_price,
    ...buckets.good_price,
    ...buckets.ok_price,
    ...buckets.overpriced,
    ...buckets.rest,
  ];
  const enriched = enrichJewelleryLastPrices(all, archives);
  // Re-bucket — same logic as the page-side compute (mirrors the SQL view's
  // price_bucket / ending_soon_no_bids / overpriced flags, which are unchanged).
  return {
    ending_soon: enriched.filter((l) => l.ending_soon_no_bids),
    low_price:   enriched.filter((l) => l.price_bucket === "low"),
    good_price:  enriched.filter((l) => l.price_bucket === "good"),
    ok_price:    enriched.filter((l) => l.price_bucket === "ok"),
    overpriced:  enriched.filter((l) => l.overpriced),
    rest:        enriched.filter((l) => !l.ending_soon_no_bids && l.price_bucket === null && !l.overpriced),
  };
}
