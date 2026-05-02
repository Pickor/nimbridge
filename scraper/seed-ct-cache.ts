/**
 * Seed cellartracker_searches with the scores we've already written onto
 * listings + auction_results. Run this once after the cache table exists,
 * so the in-progress backfill's results aren't lost.
 *
 * Idempotent: re-running keeps the higher-confidence (most-recent) score.
 */
import { createClient } from "@supabase/supabase-js";
import { cleanTitleForCellarTracker, CT_CATEGORIES } from "./cellartracker";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface Row { title: string; cellartracker_score: number | null; catawiki_category_id: number }

async function fetchScored(table: "listings" | "auction_results"): Promise<Row[]> {
  const PAGE = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await db
      .from(table)
      .select("title, cellartracker_score, catawiki_category_id")
      .in("catawiki_category_id", [...CT_CATEGORIES])
      .not("cellartracker_score", "is", null)
      .range(from, from + PAGE - 1);
    if (!data?.length) break;
    out.push(...(data as Row[]));
    if (data.length < PAGE) break;
  }
  return out;
}

async function main() {
  const rowsA = await fetchScored("listings");
  const rowsB = await fetchScored("auction_results");
  const all = [...rowsA, ...rowsB];
  console.log(`Found ${all.length} already-scored rows (listings: ${rowsA.length}, history: ${rowsB.length})`);

  // Group by cleaned title — pick the score that appears most often (mode);
  // ties broken by the highest score so we don't lose useful data.
  const byTitle = new Map<string, Map<number, number>>();
  for (const r of all) {
    const cleaned = cleanTitleForCellarTracker(r.title);
    if (!cleaned || r.cellartracker_score == null) continue;
    const counts = byTitle.get(cleaned) ?? new Map<number, number>();
    counts.set(r.cellartracker_score, (counts.get(r.cellartracker_score) ?? 0) + 1);
    byTitle.set(cleaned, counts);
  }

  console.log(`→ ${byTitle.size} unique cleaned titles`);

  let inserted = 0;
  for (const [cleaned, counts] of byTitle) {
    const best = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))[0];
    const score = best[0];
    const { error } = await db
      .from("cellartracker_searches")
      .upsert(
        { cleaned_title: cleaned, score, searched_at: new Date().toISOString() },
        { onConflict: "cleaned_title" },
      );
    if (error) console.warn(`  ⚠ ${cleaned}: ${error.message}`);
    else inserted++;
  }
  console.log(`✓ seeded ${inserted} cache entries`);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
