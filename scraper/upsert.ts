import { createClient } from "@supabase/supabase-js";
import { scrapeLot } from "./catawiki";
import type { ScrapedLot } from "./catawiki";
import { lookupVivinoRating, CATAWIKI_TO_VIVINO } from "./vivino";
import {
  CT_CATEGORIES,
  cleanTitleForCellarTracker,
  getCachedCellarTrackerScore,
} from "./cellartracker";
import { verticalOfCategory } from "./verticals";
import { extractWeightGrams } from "../lib/jewellery-value";

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE env vars");
  return createClient(url, key);
}

export async function upsertLots(
  lots: ScrapedLot[]
): Promise<{ upserted: number; errors: number }> {
  const db = makeClient();
  let upserted = 0;
  let errors = 0;
  const now = new Date().toISOString();

  for (const lot of lots) {
    try {
      // ── Vivino rating lookup (wine & champagne categories only) ────────────
      let vivinoVintageId:   number | null = null;
      let vivinoRatingAvg:   number | null = null;
      let vivinoRatingCount: number | null = null;

      if (CATAWIKI_TO_VIVINO[lot.catawiki_category_id]) {
        const vMatch = await lookupVivinoRating(db, lot.title, lot.catawiki_category_id);
        if (vMatch) {
          vivinoVintageId   = vMatch.vintage_id;
          vivinoRatingAvg   = vMatch.rating_avg;
          vivinoRatingCount = vMatch.rating_count;
        }
      }

      // ── CellarTracker score (cache-only — no live search in CI) ────────────
      // We never call CT from the scheduled scraper (its WAF blocks server-side
      // traffic). We only consult the cache populated by the local backfill.
      let cellartrackerScore: number | null = null;
      if (CT_CATEGORIES.has(lot.catawiki_category_id)) {
        const cleaned = cleanTitleForCellarTracker(lot.title);
        if (cleaned) {
          const cached = await getCachedCellarTrackerScore(db, cleaned);
          if (cached.hit) cellartrackerScore = cached.score;
        }
      }

      // Omit catawiki_subcategory_id when null so that a top-level category
      // scrape doesn't overwrite a subcategory_id set by an earlier subcategory run.
      const payload: Record<string, unknown> = {
        catawiki_id: lot.catawiki_id,
        url: lot.url,
        title: lot.title,
        image_url: lot.image_url,
        current_bid: lot.current_bid,
        currency: lot.currency,
        estimated_low: lot.estimated_low,
        estimated_high: lot.estimated_high,
        bid_count: lot.bid_count,
        unique_bidders: lot.unique_bidders,
        lot_outcome: lot.lot_outcome,
        ends_at: lot.ends_at,
        seller: lot.seller,
        seller_country: lot.seller_country,
        catawiki_category_id: lot.catawiki_category_id,
        // Tag with vertical so dashboards can filter Wine vs Jewellery vs Watches.
        // Falls back to wine-whisky-spirits if the category id isn't in the map
        // (i.e. for legacy rows pre-multi-vertical).
        category: verticalOfCategory(lot.catawiki_category_id),
        shipping_cost_eur: lot.shipping_cost_eur,
        specifications: lot.specifications ?? undefined,
        // Pre-parse weight in grams so the dashboard's "last price" match
        // (Karat + Weight for jewellery) can use a numeric column instead
        // of regex-scanning titles at query time.
        weight_g: extractWeightGrams(lot.title, lot.specifications) ?? undefined,
        is_active: true,
        last_seen_at: now,
        ...(vivinoVintageId !== null && {
          vivino_vintage_id:   vivinoVintageId,
          vivino_rating_avg:   vivinoRatingAvg,
          vivino_rating_count: vivinoRatingCount,
        }),
        ...(cellartrackerScore !== null && { cellartracker_score: cellartrackerScore }),
      };
      if (lot.catawiki_subcategory_id !== null) {
        payload.catawiki_subcategory_id = lot.catawiki_subcategory_id;
      }

      const { error } = await db.from("listings").upsert(payload, {
        onConflict: "catawiki_id",
      });
      if (error) {
        console.error(`[upsert] ${lot.catawiki_id}:`, error.message);
        errors++;
      } else {
        upserted++;
      }
    } catch (err) {
      console.error(`[upsert] unexpected for ${lot.catawiki_id}:`, err);
      errors++;
    }
  }

  return { upserted, errors };
}

export async function insertSnapshots(lots: ScrapedLot[]): Promise<void> {
  const db = makeClient();

  const { data: rows } = await db
    .from("listings")
    .select("id, catawiki_id")
    .in(
      "catawiki_id",
      lots.map((l) => l.catawiki_id)
    );

  if (!rows?.length) return;

  const idMap = new Map(rows.map((r) => [r.catawiki_id as string, r.id as string]));
  const now = new Date().toISOString();

  const snapshots = lots
    .filter((l) => idMap.has(l.catawiki_id))
    .map((l) => ({
      listing_id: idMap.get(l.catawiki_id)!,
      current_bid: l.current_bid,
      bid_count: l.bid_count,
      scraped_at: now,
    }));

  if (snapshots.length === 0) return;

  const { error } = await db.from("listing_snapshots").insert(snapshots);
  if (error) console.error("[upsert] snapshots:", error.message);
}

// Fields needed to build an auction_results record
const CLOSING_FIELDS =
  "id, catawiki_id, url, title, image_url, current_bid, final_price, " +
  "bid_count, unique_bidders, lot_outcome, estimated_low, estimated_high, " +
  "shipping_cost_eur, catawiki_category_id, catawiki_subcategory_id, " +
  "category, seller_country, sb_price, sb_product_id, ends_at, " +
  "vivino_vintage_id, vivino_rating_avg, vivino_rating_count, " +
  "cellartracker_score, weight_g";

async function archiveLot(
  db: ReturnType<typeof makeClient>,
  row: Record<string, unknown>,
  finalPrice: number | null,
): Promise<void> {
  if (finalPrice == null) {
    // No price at all — just remove from active table
    await db.from("listings").delete().eq("id", row.id);
    return;
  }

  const { error } = await db.from("auction_results").upsert(
    {
      catawiki_id:             row.catawiki_id,
      url:                     row.url,
      title:                   row.title,
      image_url:               row.image_url,
      final_price:             finalPrice,
      bid_count:               row.bid_count ?? 0,
      unique_bidders:          row.unique_bidders,
      lot_outcome:             row.lot_outcome,
      estimated_low:           row.estimated_low,
      estimated_high:          row.estimated_high,
      shipping_cost_eur:       row.shipping_cost_eur,
      catawiki_category_id:    row.catawiki_category_id,
      catawiki_subcategory_id: row.catawiki_subcategory_id,
      category:                row.category ?? "wine-whisky-spirits",
      seller_country:          row.seller_country,
      sb_price:                row.sb_price,
      sb_product_id:           row.sb_product_id,
      ends_at:                 row.ends_at,
      vivino_vintage_id:       row.vivino_vintage_id,
      vivino_rating_avg:       row.vivino_rating_avg,
      vivino_rating_count:     row.vivino_rating_count,
      cellartracker_score:     row.cellartracker_score,
      weight_g:                row.weight_g,
    },
    { onConflict: "catawiki_id", ignoreDuplicates: true },
  );
  if (error) {
    console.error(`[upsert] archive ${row.catawiki_id}:`, error.message);
    return;
  }

  // Remove from listings — it now lives in auction_results
  await db.from("listings").delete().eq("id", row.id);
}

export async function markInactive(
  seenIds: string[],
  categoryId?: number,
  subcategoryId?: number | null,
): Promise<number> {
  const db = makeClient();
  const now = new Date().toISOString();
  let count = 0;

  type ClosingRow = {
    id: string; catawiki_id: string; url: string; title: string;
    image_url: string | null; current_bid: number | null; final_price: number | null;
    bid_count: number; unique_bidders: number | null; lot_outcome: string | null;
    estimated_low: number | null; estimated_high: number | null;
    shipping_cost_eur: number | null; catawiki_category_id: number | null;
    catawiki_subcategory_id: number | null; category: string | null;
    seller_country: string | null;
    weight_g: number | null;
    sb_price: number | null;
    sb_product_id: string | null; ends_at: string;
    vivino_vintage_id: number | null; vivino_rating_avg: number | null;
    vivino_rating_count: number | null;
    cellartracker_score: number | null;
  };

  // 1. Expire by time — all active lots whose end time has passed
  const { data: expiring } = await db
    .from("listings")
    .select(CLOSING_FIELDS)
    .lt("ends_at", now)
    .eq("is_active", true) as { data: ClosingRow[] | null };

  if (expiring?.length) {
    console.log(`[upsert] Archiving ${expiring.length} closing lots…`);
    for (const row of expiring) {
      let finalPrice: number | null = row.final_price ?? row.current_bid;

      // Re-fetch from source if we don't have the final price yet
      if (row.final_price == null) {
        try {
          const fresh = await scrapeLot(
            row.catawiki_id,
            row.url,
            "",
            null,
            row.catawiki_category_id as number,
            row.catawiki_subcategory_id,
          );
          if (fresh?.current_bid != null) {
            finalPrice = fresh.current_bid;
            console.log(`[upsert] ${row.catawiki_id}: final price ${row.current_bid} → ${finalPrice}`);
          }
        } catch {
          console.warn(`[upsert] ${row.catawiki_id}: re-fetch failed, using stored bid ${finalPrice}`);
        }
      }

      await archiveLot(db, row as unknown as Record<string, unknown>, finalPrice);
      count++;
    }
  }

  // 2. Archive active lots not seen in this scrape run.
  //    Scope to categoryId so a single-category run doesn't touch lots
  //    that belong to other categories scraped separately.
  if (seenIds.length > 0) {
    let query = db
      .from("listings")
      .select(CLOSING_FIELDS)
      .eq("is_active", true)
      .gte("ends_at", now)
      .not("catawiki_id", "in", `(${seenIds.join(",")})`);

    if (categoryId !== undefined) {
      query = query.eq("catawiki_category_id", categoryId) as typeof query;
      if (subcategoryId != null) {
        query = query.eq("catawiki_subcategory_id", subcategoryId) as typeof query;
      }
    }

    const { data: unseen, error: fetchErr } = await query as { data: ClosingRow[] | null; error: unknown };

    if (fetchErr) {
      console.error("[upsert] fetch unseen:", fetchErr);
    } else if (unseen?.length) {
      console.log(`[upsert] Archiving ${unseen.length} unseen lots…`);
      for (const row of unseen) {
        const finalPrice: number | null = row.final_price ?? row.current_bid;
        await archiveLot(db, row as unknown as Record<string, unknown>, finalPrice);
        count++;
      }
    }
  }

  return count;
}

export async function logScraperRun(stats: {
  lotsFound: number;
  lotsScraped: number;
  lotsUpserted: number;
  lotsSkipped: number;
  lotsMarkedInactive: number;
  durationMs: number;
}): Promise<void> {
  const db = makeClient();
  const { error } = await db.from("scraper_runs").insert({
    lots_found: stats.lotsFound,
    lots_scraped: stats.lotsScraped,
    lots_upserted: stats.lotsUpserted,
    lots_skipped: stats.lotsSkipped,
    lots_marked_inactive: stats.lotsMarkedInactive,
    duration_ms: stats.durationMs,
  });
  if (error) console.error("[upsert] logScraperRun:", error.message);
}
