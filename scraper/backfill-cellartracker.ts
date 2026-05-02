/**
 * Backfill CellarTracker scores on every wine/champagne/port lot in
 * `listings` and `auction_results`.
 *
 * Local-only: requires Chrome running with --remote-debugging-port=9222
 * and the user signed into CellarTracker. See scraper/cellartracker.ts
 * for the full setup description.
 *
 * Skips rows that already have a cellartracker_score, so safe to re-run
 * after a partial completion.
 *
 * Usage:
 *   set -a && source .env.local && pnpm exec tsx scraper/backfill-cellartracker.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  openCellarTrackerSession,
  lookupCellarTrackerScore,
  cleanTitleForCellarTracker,
  CT_CATEGORIES,
  getCachedCellarTrackerScore,
  cacheCellarTrackerScore,
} from "./cellartracker";

// Delay between consecutive CT searches. Default 5 s — CT pages settle in
// ~3 s so the actual cadence is ~8 s/search, well within "human clicks
// results" speed. Override via `$env:CT_DELAY_MS = "3000"` etc. if needed.
const DELAY_MS = parseInt(process.env.CT_DELAY_MS ?? "5000", 10);
const PROGRESS_EVERY = 5;          // log every N rows so the user sees activity
const WAF_BACKOFF_MS = 5 * 60_000; // if we hit a WAF block, sleep 5 min

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface Row { id: string; title: string; catawiki_category_id: number }

async function fetchUnscored(table: "listings" | "auction_results"): Promise<Row[]> {
  const PAGE = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select("id, title, catawiki_category_id")
      .in("catawiki_category_id", [...CT_CATEGORIES])
      .is("cellartracker_score", null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  console.log("Connecting to debug Chrome on localhost:9222 …");
  const sess = await openCellarTrackerSession();
  console.log("✓ session OK\n");

  // ── Pull every unscored wine/champagne/port row from both tables ────────
  const allRows: { table: "listings" | "auction_results"; row: Row }[] = [];
  for (const table of ["listings", "auction_results"] as const) {
    const rows = await fetchUnscored(table);
    rows.forEach((row) => allRows.push({ table, row }));
    console.log(`  ${table}: ${rows.length} unscored`);
  }

  // ── Group rows by cleaned title — one CT search per unique title ────────
  const byCleaned = new Map<string, typeof allRows>();
  let skippedEmpty = 0;
  for (const item of allRows) {
    const cleaned = cleanTitleForCellarTracker(item.row.title);
    if (!cleaned) { skippedEmpty++; continue; }
    const arr = byCleaned.get(cleaned) ?? [];
    arr.push(item);
    byCleaned.set(cleaned, arr);
  }
  console.log(`\n${allRows.length} rows → ${byCleaned.size} unique cleaned titles (skipped_empty=${skippedEmpty})`);
  const estMin = Math.round((byCleaned.size * (DELAY_MS + 4_000)) / 60_000);
  console.log(`Estimated wall-clock: ~${estMin} min at ${DELAY_MS / 1000}s/search\n`);

  let processed  = 0;
  let cacheHits  = 0;
  let ctSearches = 0;
  let matched    = 0;
  let updated    = 0;
  let lastSearch = 0;

  for (const [cleaned, items] of byCleaned) {
    processed++;

    // 1. Cache check — if we've already searched this cleaned title (with
    //    a real hit OR a tombstone "no match"), skip the CT request.
    const cached = await getCachedCellarTrackerScore(db, cleaned);
    let score: number | null = null;
    let usedCache = false;
    if (cached.hit) {
      cacheHits++;
      usedCache = true;
      score = cached.score;
    } else {
      // 2. Pace: ≥ DELAY_MS between actual CT navigations (cache hits are free).
      const sinceLast = Date.now() - lastSearch;
      if (lastSearch > 0 && sinceLast < DELAY_MS) {
        await new Promise((r) => setTimeout(r, DELAY_MS - sinceLast));
      }

      try {
        score = await lookupCellarTrackerScore(sess.page, items[0].row.title);
      } catch (e) {
        const msg = (e as Error).message;
        console.warn(`  ⚠ ${msg}`);
        if (/WAF block/i.test(msg)) {
          console.warn(`     backing off ${WAF_BACKOFF_MS / 60_000} min…`);
          await new Promise((r) => setTimeout(r, WAF_BACKOFF_MS));
        }
      }
      lastSearch = Date.now();
      ctSearches++;

      // Persist outcome (real score OR tombstone) so we never re-search this title.
      await cacheCellarTrackerScore(db, cleaned, score);
    }

    if (score != null) {
      matched++;
      for (const it of items) {
        const { error } = await db
          .from(it.table)
          .update({ cellartracker_score: score })
          .eq("id", it.row.id);
        if (error) console.warn(`  update ${it.row.id}: ${error.message}`);
        else updated++;
      }
    }

    if (processed % PROGRESS_EVERY === 0 || processed === byCleaned.size) {
      const pct = ((processed / byCleaned.size) * 100).toFixed(0);
      console.log(
        `  ${String(processed).padStart(4)}/${byCleaned.size} (${pct.padStart(3)}%)` +
        `  cache=${cacheHits}  ct=${ctSearches}  matched=${matched}  rows=${updated}` +
        `  ${usedCache ? "💾" : "🔍"} "${cleaned.slice(0, 50)}" → ${score ?? "—"}`,
      );
    }
  }

  console.log(`\n✓ processed=${processed} cache_hits=${cacheHits} ct_searches=${ctSearches} matched=${matched} rows_updated=${updated} skipped_empty=${skippedEmpty}`);
  await sess.close();
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
