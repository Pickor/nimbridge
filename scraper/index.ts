import { scrapeCategoryLotIds, scrapeLot, sleep } from "./catawiki";
import type { ScrapedLot } from "./catawiki";
import { upsertLots, insertSnapshots, markInactive, logScraperRun } from "./upsert";

const LOT_DELAY_MS  = 1200;
const CONCURRENCY   = 4; // categories scraped simultaneously

interface ScrapeTarget {
  categoryId: number;
  subcategoryIds?: number[];
  label: string;
}

const SCRAPE_TARGETS: ScrapeTarget[] = [
  // ── Whisky (437) ──────────────────────────────────────────────────────────
  { categoryId: 437, subcategoryIds: [441],  label: "Exclusive Whisky" },
  { categoryId: 437, subcategoryIds: [1475], label: "Japanese & Asian Whisky" },
  { categoryId: 437, subcategoryIds: [461],  label: "Regular Whisky" },

  // ── Rum, Cognac & Fine Spirits (965) ──────────────────────────────────────
  { categoryId: 965, subcategoryIds: [705],  label: "Rum" },
  { categoryId: 965, subcategoryIds: [1477], label: "Exclusive Rum" },
  { categoryId: 965, subcategoryIds: [615],  label: "Cognac & Armagnac" },
  { categoryId: 965, subcategoryIds: [1503], label: "Exclusive Cognac & Armagnac" },
  { categoryId: 965, subcategoryIds: [967],  label: "Fine Spirits & Liqueurs" },
  { categoryId: 965, subcategoryIds: [1638], label: "Chartreuse" },

  // ── Champagne (961) ───────────────────────────────────────────────────────
  { categoryId: 961, subcategoryIds: [613],  label: "Champagne" },
  { categoryId: 961, subcategoryIds: [929],  label: "Dom Pérignon Champagne" },

  // ── Port & Sweet Wines (971) ──────────────────────────────────────────────
  { categoryId: 971, subcategoryIds: [449],  label: "Port & Madeira" },
  { categoryId: 971, subcategoryIds: [973],  label: "Dessert & Sweet Wines" },

  // ── Wine (443) ────────────────────────────────────────────────────────────
  { categoryId: 443, subcategoryIds: [447],  label: "Exclusive Wine" },
  { categoryId: 443, subcategoryIds: [695],  label: "Bordeaux Grand Cru Wine" },
  { categoryId: 443, subcategoryIds: [765],  label: "Burgundy Crus Wine" },
  { categoryId: 443, subcategoryIds: [463],  label: "Premium Wine" },
  { categoryId: 443, subcategoryIds: [1025], label: "Italian Wine" },
  { categoryId: 443, subcategoryIds: [1473], label: "Rhône Valley Wine" },
  { categoryId: 443, subcategoryIds: [937],  label: "Spanish & Portuguese Wine" },
  { categoryId: 443, subcategoryIds: [737],  label: "Big Bottles Wine" },

  // ── Beer (963) ────────────────────────────────────────────────────────────
  { categoryId: 963, label: "Beer" },

  // ── Jewellery ─────────────────────────────────────────────────────────────
  { categoryId: 715, label: "Diamonds" }, // own top-level
  { categoryId: 313, subcategoryIds: [1660], label: "Jewellery — Gold" },
  { categoryId: 313, subcategoryIds: [841],  label: "Jewellery — Silver" },

  // ── Watches ───────────────────────────────────────────────────────────────
  { categoryId: 333, subcategoryIds: [343],  label: "Watches — Rolex" },
  { categoryId: 333, subcategoryIds: [697],  label: "Watches — Omega" },
];

// ── Scrape one target, writing results into shared arrays ──────────────────

async function scrapeTarget(
  target: ScrapeTarget,
  allScraped: ScrapedLot[],
  allSeenIds: Set<string>,
  allSkipped: string[],
): Promise<number> {
  const tag = `[${target.label}]`;
  console.log(`\n── ${target.label} starting ──`);

  const categoryLots = await scrapeCategoryLotIds(target.categoryId, target.subcategoryIds);
  console.log(`${tag} ${categoryLots.length} lots found`);
  if (categoryLots.length === 0) return 0;

  const subcategoryId = target.subcategoryIds?.length === 1
    ? target.subcategoryIds[0]
    : null;

  for (let i = 0; i < categoryLots.length; i++) {
    const { id, url, title, imageUrl } = categoryLots[i];

    // Skip duplicates (lot already scraped by another concurrent target)
    if (allSeenIds.has(id)) {
      console.log(`${tag} [${i + 1}/${categoryLots.length}] ${id} dup`);
      continue;
    }

    const lot = await scrapeLot(id, url, title, imageUrl, target.categoryId, subcategoryId);
    if (lot) {
      allScraped.push(lot);
      allSeenIds.add(id);
      console.log(`${tag} [${i + 1}/${categoryLots.length}] ${id} ok`);
    } else {
      allSkipped.push(id);
      console.log(`${tag} [${i + 1}/${categoryLots.length}] ${id} SKIP`);
    }

    if (i < categoryLots.length - 1) {
      await sleep(LOT_DELAY_MS + Math.random() * 800);
    }
  }

  console.log(`${tag} done`);
  return categoryLots.length;
}

// ── Run targets with a fixed concurrency pool ──────────────────────────────

async function runConcurrent(
  targets: ScrapeTarget[],
  concurrency: number,
  allScraped: ScrapedLot[],
  allSeenIds: Set<string>,
  allSkipped: string[],
): Promise<number> {
  let totalFound = 0;
  const queue = [...targets];

  async function worker() {
    while (queue.length > 0) {
      const target = queue.shift()!;
      totalFound += await scrapeTarget(target, allScraped, allSeenIds, allSkipped);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return totalFound;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startMs = Date.now();
  console.log("=== Nimbridge scraper start ===");
  console.log(new Date().toISOString());
  console.log(`Concurrency: ${CONCURRENCY} categories at a time`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const allScraped: ScrapedLot[] = [];
  const allSkipped: string[]     = [];
  const allSeenIds                = new Set<string>();

  // ── Step 1+2: collect lot IDs and scrape details in parallel ──────────
  const totalFound = await runConcurrent(
    SCRAPE_TARGETS, CONCURRENCY, allScraped, allSeenIds, allSkipped,
  );

  // ── Step 3: upsert ─────────────────────────────────────────────────────
  console.log(`\nUpserting ${allScraped.length} lots…`);
  const { upserted, errors } = await upsertLots(allScraped);

  // ── Step 4: snapshots ──────────────────────────────────────────────────
  await insertSnapshots(allScraped);

  // ── Step 5: mark inactive ──────────────────────────────────────────────
  const markedInactive = await markInactive([...allSeenIds]);

  // ── Step 6: log run ────────────────────────────────────────────────────
  await logScraperRun({
    lotsFound:          totalFound,
    lotsScraped:        allScraped.length,
    lotsUpserted:       upserted,
    lotsSkipped:        allSkipped.length,
    lotsMarkedInactive: markedInactive,
    durationMs:         Date.now() - startMs,
  });

  // ── Summary ────────────────────────────────────────────────────────────
  const mins = ((Date.now() - startMs) / 60000).toFixed(1);
  console.log("\n=== Scrape Summary ===");
  console.log(`Duration               : ${mins} min`);
  console.log(`Lots found on Catawiki : ${totalFound}`);
  console.log(`Lots scraped           : ${allScraped.length}`);
  console.log(`Lots skipped (errors)  : ${allSkipped.length}`);
  console.log(`DB upserted            : ${upserted}`);
  console.log(`DB errors              : ${errors}`);
  console.log(`Marked inactive        : ${markedInactive}`);
  console.log("======================");
}

main().catch((err: unknown) => {
  console.error("Fatal scraper error:", err);
  process.exit(1);
});
