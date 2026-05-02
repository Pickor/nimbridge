/**
 * GET /api/cron/scrape — Vercel-cron-callable scrape trigger.
 *
 * Currently NOT scheduled in vercel.json — the GH Actions matrix workflow
 * (.github/workflows/crawler.yml) is the active scraper. This endpoint is
 * kept as an alternative path if Vercel cron becomes preferred.
 *
 * Protected by a shared CRON_SECRET to prevent random callers from
 * triggering full scrapes.
 */
import { NextResponse } from "next/server";
import { scrapeCategoryLotIds, scrapeLot, sleep } from "@/scraper/catawiki";
import type { ScrapedLot } from "@/scraper/catawiki";
import { upsertLots, insertSnapshots, markInactive, logScraperRun } from "@/scraper/upsert";

// maxDuration = 900 → uncomment when on Vercel Pro (requires paid plan)
// export const maxDuration = 900;

// Protect with a shared secret so only Vercel cron (and you) can trigger it
function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

const LOT_DELAY_MS  = 800; // slightly faster than local — no IP risk in cloud
const CONCURRENCY   = 6;   // more parallelism to finish within 15 min

interface ScrapeTarget { categoryId: number; subcategoryIds?: number[]; label: string; }

const SCRAPE_TARGETS: ScrapeTarget[] = [
  { categoryId: 437, subcategoryIds: [441],  label: "Exclusive Whisky" },
  { categoryId: 437, subcategoryIds: [1475], label: "Japanese & Asian Whisky" },
  { categoryId: 437, subcategoryIds: [461],  label: "Regular Whisky" },
  { categoryId: 965, subcategoryIds: [705],  label: "Rum" },
  { categoryId: 965, subcategoryIds: [1477], label: "Exclusive Rum" },
  { categoryId: 965, subcategoryIds: [615],  label: "Cognac & Armagnac" },
  { categoryId: 965, subcategoryIds: [1503], label: "Exclusive Cognac & Armagnac" },
  { categoryId: 965, subcategoryIds: [967],  label: "Fine Spirits & Liqueurs" },
  { categoryId: 965, subcategoryIds: [1638], label: "Chartreuse" },
  { categoryId: 961, subcategoryIds: [613],  label: "Champagne" },
  { categoryId: 961, subcategoryIds: [929],  label: "Dom Pérignon Champagne" },
  { categoryId: 971, subcategoryIds: [449],  label: "Port & Madeira" },
  { categoryId: 971, subcategoryIds: [973],  label: "Dessert & Sweet Wines" },
  { categoryId: 443, subcategoryIds: [447],  label: "Exclusive Wine" },
  { categoryId: 443, subcategoryIds: [695],  label: "Bordeaux Grand Cru Wine" },
  { categoryId: 443, subcategoryIds: [765],  label: "Burgundy Crus Wine" },
  { categoryId: 443, subcategoryIds: [463],  label: "Premium Wine" },
  { categoryId: 443, subcategoryIds: [1025], label: "Italian Wine" },
  { categoryId: 443, subcategoryIds: [1473], label: "Rhône Valley Wine" },
  { categoryId: 443, subcategoryIds: [937],  label: "Spanish & Portuguese Wine" },
  { categoryId: 443, subcategoryIds: [737],  label: "Big Bottles Wine" },
  { categoryId: 963, label: "Beer" },
  // Jewellery
  { categoryId: 715, label: "Diamonds" },
  { categoryId: 313, subcategoryIds: [1660], label: "Jewellery — Gold" },
  { categoryId: 313, subcategoryIds: [841],  label: "Jewellery — Silver" },
  // Watches
  { categoryId: 333, subcategoryIds: [343],  label: "Watches — Rolex" },
  { categoryId: 333, subcategoryIds: [697],  label: "Watches — Omega" },
];

async function scrapeTarget(
  target: ScrapeTarget,
  allScraped: ScrapedLot[],
  allSeenIds: Set<string>,
  allSkipped: string[],
): Promise<number> {
  const categoryLots = await scrapeCategoryLotIds(target.categoryId, target.subcategoryIds);
  if (categoryLots.length === 0) return 0;
  const subcategoryId = target.subcategoryIds?.length === 1 ? target.subcategoryIds[0] : null;
  for (let i = 0; i < categoryLots.length; i++) {
    const { id, url, title, imageUrl } = categoryLots[i];
    if (allSeenIds.has(id)) continue;
    const lot = await scrapeLot(id, url, title, imageUrl, target.categoryId, subcategoryId);
    if (lot) { allScraped.push(lot); allSeenIds.add(id); }
    else { allSkipped.push(id); }
    if (i < categoryLots.length - 1) await sleep(LOT_DELAY_MS + Math.random() * 400);
  }
  return categoryLots.length;
}

async function runConcurrent(
  targets: ScrapeTarget[], concurrency: number,
  allScraped: ScrapedLot[], allSeenIds: Set<string>, allSkipped: string[],
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

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs    = Date.now();
  const allScraped: ScrapedLot[] = [];
  const allSkipped: string[]     = [];
  const allSeenIds               = new Set<string>();

  const totalFound = await runConcurrent(SCRAPE_TARGETS, CONCURRENCY, allScraped, allSeenIds, allSkipped);
  const { upserted, errors } = await upsertLots(allScraped);
  await insertSnapshots(allScraped);
  const markedInactive = await markInactive([...allSeenIds]);
  await logScraperRun({
    lotsFound: totalFound, lotsScraped: allScraped.length,
    lotsUpserted: upserted, lotsSkipped: allSkipped.length,
    lotsMarkedInactive: markedInactive, durationMs: Date.now() - startMs,
  });

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startMs,
    totalFound, scraped: allScraped.length, upserted, errors, markedInactive,
  });
}
