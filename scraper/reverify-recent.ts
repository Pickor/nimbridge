/**
 * Re-verify lot_outcome for recently-ended auctions.
 *
 * Catawiki's `sold` flag isn't reliable at scrape time — it stays false/null
 * for hours-to-days after the auction ends, until the buyer's payment clears.
 * Our main scraper archives a few hours after end, so it often captures
 * "not_sold" for lots that genuinely sold. The archive upsert uses
 * ignoreDuplicates: true so re-archiving never overwrites the stale outcome.
 *
 * This script fixes that. It pulls every auction_results row whose
 * lot_outcome is not 'sold' yet and that ended within WINDOW_HOURS, re-fetches
 * the lot from Catawiki, and updates lot_outcome (and final_price if changed)
 * when the fresh value differs.
 *
 * Usage:
 *   tsx scraper/reverify-recent.ts          # default 48h window
 *   tsx scraper/reverify-recent.ts 168      # 7-day window (one-off backfill)
 */

import { createClient } from "@supabase/supabase-js";
import { scrapeLot, sleep } from "./catawiki";

const LOT_DELAY_MS = 1000;
const DEFAULT_WINDOW_HOURS = 48;

async function main() {
  const windowHours = Number(process.argv[2] ?? DEFAULT_WINDOW_HOURS);
  if (!Number.isFinite(windowHours) || windowHours <= 0) {
    console.error(`Invalid window: ${process.argv[2]}`);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const db = createClient(url, key);
  const cutoff = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

  console.log(`=== reverify-recent: window=${windowHours}h (since ${cutoff}) ===`);

  // Candidates: anything not yet recorded as sold (or null) that ended in the window.
  // We don't re-check 'sold' rows — once Catawiki commits to sold, it stays sold.
  type Row = {
    id: string;
    catawiki_id: string;
    url: string;
    title: string;
    image_url: string | null;
    lot_outcome: string | null;
    final_price: number | null;
    estimated_low: number | null;
    catawiki_category_id: number | null;
    catawiki_subcategory_id: number | null;
    ends_at: string;
  };

  const { data: rows, error } = await db
    .from("auction_results")
    .select(
      "id, catawiki_id, url, title, image_url, lot_outcome, final_price, estimated_low, catawiki_category_id, catawiki_subcategory_id, ends_at"
    )
    .or("lot_outcome.eq.not_sold,lot_outcome.is.null")
    .gte("ends_at", cutoff)
    .order("ends_at", { ascending: false }) as { data: Row[] | null; error: unknown };

  if (error) {
    console.error("DB error:", error);
    process.exit(1);
  }
  if (!rows?.length) {
    console.log("No candidates in window. Nothing to do.");
    return;
  }

  console.log(`Found ${rows.length} candidate lot(s) to re-verify.\n`);

  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const tag = `[${i + 1}/${rows.length}] ${row.catawiki_id}`;

    try {
      const fresh = await scrapeLot(
        row.catawiki_id,
        row.url,
        row.title,
        row.image_url,
        row.catawiki_category_id ?? 0,
        row.catawiki_subcategory_id,
      );

      if (!fresh) {
        console.log(`${tag} skip (scrapeLot returned null)`);
      } else if (fresh.lot_outcome === row.lot_outcome) {
        unchanged++;
      } else {
        // Update lot_outcome and refresh final_price from the freshly-read bid
        const updates: Record<string, unknown> = { lot_outcome: fresh.lot_outcome };
        if (fresh.current_bid != null && fresh.current_bid !== row.final_price) {
          updates.final_price = fresh.current_bid;
        }
        const { error: updErr } = await db
          .from("auction_results")
          .update(updates)
          .eq("id", row.id);
        if (updErr) {
          console.error(`${tag} update failed:`, updErr.message);
          errors++;
        } else {
          console.log(`${tag} ${row.lot_outcome ?? "null"} → ${fresh.lot_outcome} ✓`);
          updated++;
        }
      }
    } catch (err) {
      console.error(`${tag} unexpected:`, err);
      errors++;
    }

    if (i < rows.length - 1) await sleep(LOT_DELAY_MS + Math.random() * 400);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated   : ${updated}`);
  console.log(`Unchanged : ${unchanged}`);
  console.log(`Errors    : ${errors}`);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
