/**
 * One-off targeted scrape. Usage:
 *   tsx --env-file=.env.local scraper/run-one.ts <categoryId> [subcategoryId,subcategoryId,...]
 *
 * Examples:
 *   tsx --env-file=.env.local scraper/run-one.ts 437 441
 *   tsx --env-file=.env.local scraper/run-one.ts 965
 */

import { scrapeCategoryLotIds, scrapeLot, sleep } from "./catawiki";
import { upsertLots, insertSnapshots, markInactive, logScraperRun } from "./upsert";

const LOT_DELAY_MS = 1200;

async function main() {
  const [, , rawCategory, rawSubs] = process.argv;
  const categoryId = rawCategory ? parseInt(rawCategory, 10) : NaN;
  if (isNaN(categoryId)) {
    console.error("Usage: tsx scraper/run-one.ts <categoryId> [subcategoryId,...]");
    process.exit(1);
  }
  const subcategoryIds = rawSubs
    ? rawSubs.split(",").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n))
    : undefined;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const startMs = Date.now();
  const label = `category ${categoryId}${subcategoryIds?.length ? ` l2:${subcategoryIds.join(",")}` : ""}`;
  console.log(`=== run-one: ${label} ===`);
  console.log(new Date().toISOString());

  const categoryLots = await scrapeCategoryLotIds(categoryId, subcategoryIds);
  console.log(`\nFound ${categoryLots.length} lot IDs`);

  if (categoryLots.length === 0) {
    console.warn("No lots found. Exiting.");
    return;
  }

  const scraped = [];
  const skipped: string[] = [];
  const subcategoryId = subcategoryIds?.length === 1 ? subcategoryIds[0] : null;

  for (let i = 0; i < categoryLots.length; i++) {
    const { id, url, title, imageUrl } = categoryLots[i];
    process.stdout.write(`[${i + 1}/${categoryLots.length}] lot ${id} … `);

    const lot = await scrapeLot(id, url, title, imageUrl, categoryId, subcategoryId);
    if (lot) {
      scraped.push(lot);
      process.stdout.write("ok\n");
    } else {
      skipped.push(id);
      process.stdout.write("SKIP\n");
    }

    if (i < categoryLots.length - 1) {
      await sleep(LOT_DELAY_MS + Math.random() * 800);
    }
  }

  const { upserted, errors } = await upsertLots(scraped);
  await insertSnapshots(scraped);
  const seenIds = scraped.map((l) => l.catawiki_id);
  // Scope markInactive to this category/subcategory so other categories' lots
  // are not deactivated just because they weren't in this run.
  const markedInactive = await markInactive(seenIds, categoryId, subcategoryId ?? undefined);

  await logScraperRun({
    lotsFound: categoryLots.length,
    lotsScraped: scraped.length,
    lotsUpserted: upserted,
    lotsSkipped: skipped.length,
    lotsMarkedInactive: markedInactive,
    durationMs: Date.now() - startMs,
  });

  console.log("\n=== Summary ===");
  console.log(`Found    : ${categoryLots.length}`);
  console.log(`Scraped  : ${scraped.length}`);
  console.log(`Upserted : ${upserted}`);
  console.log(`Errors   : ${errors}`);
  console.log(`Inactive : ${markedInactive}`);
  console.log(`Duration : ${((Date.now() - startMs) / 1000).toFixed(1)}s`);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
