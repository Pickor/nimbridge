/**
 * GET /api/cron/scrape-favorites — refresh just the lots that users have
 * favorited. Called by GH Actions (`feed-favorites.yml`) on a schedule.
 *
 * Loads every distinct listing_id from `favorites`, fetches the latest
 * lot data from Catawiki for each, and writes a snapshot. Much cheaper
 * than a full category scrape.
 *
 * Capped at 60s by default (Vercel Hobby ceiling); raise `maxDuration`
 * if running on Pro and needing more time.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scrapeLot, sleep } from "@/scraper/catawiki";
import type { ScrapedLot } from "@/scraper/catawiki";
import { upsertLots, insertSnapshots } from "@/scraper/upsert";

// Increase if on Vercel Pro; Hobby caps at 60s
export const maxDuration = 60;

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE env vars");
  return createClient(url, key);
}

function isAuthorized(req: Request): boolean {
  const auth   = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

const CONCURRENCY = 4;
const LOT_DELAY_MS = 300; // lighter than full scrape — individual pages only

interface FavListing {
  catawiki_id: string;
  url: string;
  title: string;
  image_url: string | null;
  catawiki_category_id: number;
  catawiki_subcategory_id: number | null;
}

async function scrapeWithConcurrency(
  lots: FavListing[],
  concurrency: number,
): Promise<ScrapedLot[]> {
  const results: ScrapedLot[] = [];
  const queue = [...lots];

  async function worker() {
    while (queue.length > 0) {
      const lot = queue.shift()!;
      const scraped = await scrapeLot(
        lot.catawiki_id,
        lot.url,
        lot.title,
        lot.image_url,
        lot.catawiki_category_id,
        lot.catawiki_subcategory_id,
      );
      if (scraped) results.push(scraped);
      if (queue.length > 0) await sleep(LOT_DELAY_MS + Math.random() * 200);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();
  const db      = makeAdminClient();
  const now     = new Date().toISOString();

  // ── 1. Collect all unique favorited listing IDs ──────────────────────────
  const { data: favRows, error: favErr } = await db
    .from("favorites")
    .select("listing_id");

  if (favErr || !favRows?.length) {
    return NextResponse.json({ ok: true, message: "No favorites", scraped: 0, durationMs: Date.now() - startMs });
  }

  const uniqueIds = [...new Set(favRows.map((f) => f.listing_id as string))];

  // ── 2. Load active, not-yet-ended listings for those IDs ─────────────────
  const { data: listings, error: listErr } = await db
    .from("listings")
    .select("catawiki_id, url, title, image_url, catawiki_category_id, catawiki_subcategory_id, ends_at")
    .in("id", uniqueIds)
    .eq("is_active", true)
    .gt("ends_at", now);

  if (listErr || !listings?.length) {
    return NextResponse.json({ ok: true, message: "No active favorited lots", scraped: 0, durationMs: Date.now() - startMs });
  }

  // ── 3. Re-scrape each lot ─────────────────────────────────────────────────
  const scraped = await scrapeWithConcurrency(listings as FavListing[], CONCURRENCY);

  // ── 4. Persist updates ────────────────────────────────────────────────────
  let upserted = 0;
  if (scraped.length > 0) {
    const result = await upsertLots(scraped);
    upserted = result.upserted;
    await insertSnapshots(scraped);
  }

  // ── 5. Archive lots that ended during (or before) this run ───────────────
  //    Pass empty seenIds so only time-based expiry runs (no unseen-lot cleanup,
  //    which is the full daily scraper's job).
  const { data: expired } = await db
    .from("listings")
    .select("id, catawiki_id, url, title, image_url, current_bid, final_price, bid_count, unique_bidders, lot_outcome, estimated_low, estimated_high, shipping_cost_eur, catawiki_category_id, catawiki_subcategory_id, sb_price, sb_product_id, ends_at")
    .in("id", uniqueIds)
    .lt("ends_at", now)
    .eq("is_active", true);

  let archived = 0;
  if (expired?.length) {
    for (const row of expired) {
      const finalPrice: number | null = (row.final_price as number | null) ?? (row.current_bid as number | null);
      if (finalPrice != null) {
        await db.from("auction_results").upsert(
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
            sb_price:                row.sb_price,
            sb_product_id:           row.sb_product_id,
            ends_at:                 row.ends_at,
          },
          { onConflict: "catawiki_id", ignoreDuplicates: true },
        );
      }
      await db.from("listings").delete().eq("id", row.id);
      archived++;
    }
  }

  return NextResponse.json({
    ok: true,
    favoritedLots: listings.length,
    scraped: scraped.length,
    upserted,
    archived,
    durationMs: Date.now() - startMs,
  });
}
