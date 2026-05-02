/**
 * Scrape specific lots by catawiki ID (comma-separated).
 * Usage: tsx scraper/scrape-lots.ts "103258835,12345678"
 */

import { createClient } from "@supabase/supabase-js";
import { scrapeLot, sleep } from "./catawiki";
import { upsertLots, insertSnapshots } from "./upsert";

const LOT_DELAY_MS = 800;

async function main() {
  const rawInput = process.argv[2] ?? "";
  const catawikiIds = rawInput.split(",").map((s) => s.trim()).filter(Boolean);

  if (catawikiIds.length === 0) {
    console.error("Usage: tsx scraper/scrape-lots.ts \"id1,id2,...\"");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const db = createClient(url, key);
  const now = new Date().toISOString();

  // Load listing details from DB
  const { data: listings, error } = await db
    .from("listings")
    .select("catawiki_id, url, title, image_url, catawiki_category_id, catawiki_subcategory_id")
    .in("catawiki_id", catawikiIds)
    .eq("is_active", true)
    .gt("ends_at", now);

  if (error) {
    console.error("DB error:", error.message);
    process.exit(1);
  }

  if (!listings?.length) {
    console.log("No active listings found for given catawiki IDs:", catawikiIds.join(", "));
    return;
  }

  console.log(`=== scrape-lots: ${listings.length} lot(s) ===`);
  console.log(new Date().toISOString());

  const scraped = [];

  for (let i = 0; i < listings.length; i++) {
    const l = listings[i];
    console.log(`\n[${i + 1}/${listings.length}] ${l.catawiki_id} — ${l.title}`);

    const lot = await scrapeLot(
      l.catawiki_id,
      l.url,
      l.title,
      l.image_url,
      l.catawiki_category_id,
      l.catawiki_subcategory_id,
    );

    if (lot) {
      console.log(`  → bid=${lot.current_bid} EUR  bids=${lot.bid_count}  shipping=${lot.shipping_cost_eur ?? "null"} EUR`);
      scraped.push(lot);
    } else {
      console.warn(`  → SKIP (scrapeLot returned null)`);
    }

    if (i < listings.length - 1) await sleep(LOT_DELAY_MS + Math.random() * 400);
  }

  if (scraped.length === 0) {
    console.log("\nNothing scraped — no upserts.");
    return;
  }

  const { upserted, errors } = await upsertLots(scraped);
  await insertSnapshots(scraped);

  console.log("\n=== Summary ===");
  console.log(`Scraped  : ${scraped.length}`);
  console.log(`Upserted : ${upserted}`);
  console.log(`Errors   : ${errors}`);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
