/**
 * Vivino wine ratings sync script.
 *
 * Downloads wines from Vivino's explore API by wine type and upserts them
 * into the vivino_wines Supabase table for local fuzzy-matching.
 *
 * Vivino wine type IDs (reverse-engineered from explore API):
 *   1  = Red wine
 *   2  = White wine
 *   3  = Champagne / Sparkling
 *   4  = Rosé
 *   24 = Port / Fortified
 *
 * Run manually or via GitHub Actions weekly:
 *   tsx scraper/sync-vivino.ts
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ─────────────────────────────────────────────────────────────────

const VIVINO_BASE = "https://www.vivino.com/api/explore/explore";
const PAGE_SIZE   = 50;
const DELAY_MS    = 900;          // polite delay between Vivino requests
const BATCH_SIZE  = 200;          // rows per Supabase upsert batch

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Wine types to sync and how many pages to download.
// type 3 (Champagne): ~5000 wines → 100 pages
// type 24 (Port): ~570 wines → 15 pages
// type 1 (Red): top 2000 → 40 pages
// type 2 (White): top 2000 → 40 pages
const WINE_TYPES: { type_id: number; label: string; max_pages: number }[] = [
  { type_id: 3,  label: "Champagne",  max_pages: 100 },
  { type_id: 24, label: "Port",       max_pages: 15  },
  { type_id: 1,  label: "Red Wine",   max_pages: 40  },
  { type_id: 2,  label: "White Wine", max_pages: 40  },
];

// Pause between wine type batches — long enough for Vivino rate-limit to reset
const TYPE_PAUSE_MS = 45_000;

// ── Types ──────────────────────────────────────────────────────────────────

interface VivinoMatch {
  vintage: {
    id: number;
    name: string;
    seo_name: string;
    statistics: {
      ratings_average: number;
      ratings_count: number;
      wine_ratings_average: number;
      wine_ratings_count: number;
    };
    wine: {
      id: number;
      name: string;
      type_id: number;
    };
  };
}

interface VivinoResponse {
  explore_vintage: {
    records_matched: number;
    matches: VivinoMatch[];
  };
}

interface WineRow {
  vivino_vintage_id:    number;
  vivino_wine_id:       number;
  vintage_name:         string;
  wine_name:            string;
  seo_name:             string | null;
  wine_type_id:         number;
  ratings_average:      number | null;
  ratings_count:        number;
  wine_ratings_average: number | null;
  wine_ratings_count:   number;
  fetched_at:           string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchVivinoPage(
  typeId: number,
  page: number,
): Promise<VivinoResponse | null> {
  const url =
    `${VIVINO_BASE}?language=en&currency_code=EUR` +
    `&wine_type_ids[]=${typeId}&per_page=${PAGE_SIZE}&page=${page}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":      USER_AGENT,
        "Accept":          "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn(`  Vivino HTTP ${res.status} on type=${typeId} page=${page}`);
      return null;
    }
    return res.json() as Promise<VivinoResponse>;
  } catch (err) {
    console.warn(`  Vivino fetch error type=${typeId} page=${page}:`, err);
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const db = createClient(supabaseUrl, supabaseKey);
  const fetchedAt = new Date().toISOString();

  let grandTotal = 0;

  for (const wt of WINE_TYPES) {
    console.log(`\n═══ ${wt.label} (type_id=${wt.type_id}) ═══`);

    let typeTotal = 0;
    let page = 1;

    while (page <= wt.max_pages) {
      const data = await fetchVivinoPage(wt.type_id, page);
      if (!data) break;

      const matches = data.explore_vintage?.matches ?? [];
      if (matches.length === 0) {
        console.log(`  page=${page}: 0 matches — stopping`);
        break;
      }

      const rows: WineRow[] = matches.map((m) => ({
        vivino_vintage_id:    m.vintage.id,
        vivino_wine_id:       m.vintage.wine.id,
        vintage_name:         m.vintage.name,
        wine_name:            m.vintage.wine.name,
        seo_name:             m.vintage.seo_name ?? null,
        wine_type_id:         wt.type_id,
        ratings_average:      m.vintage.statistics.ratings_average || null,
        ratings_count:        m.vintage.statistics.ratings_count || 0,
        wine_ratings_average: m.vintage.statistics.wine_ratings_average || null,
        wine_ratings_count:   m.vintage.statistics.wine_ratings_count || 0,
        fetched_at:           fetchedAt,
      }));

      // Upsert in one batch (PAGE_SIZE ≤ BATCH_SIZE so no sub-batching needed)
      const { error } = await db
        .from("vivino_wines")
        .upsert(rows, { onConflict: "vivino_vintage_id" });

      if (error) {
        console.error(`  page=${page} upsert error:`, error.message);
      } else {
        typeTotal += rows.length;
        const totalMatched = data.explore_vintage.records_matched;
        const pagesTotal   = Math.ceil(totalMatched / PAGE_SIZE);
        console.log(
          `  page=${page}/${Math.min(wt.max_pages, pagesTotal)}` +
          `  +${rows.length}  cumulative=${typeTotal}` +
          `  (Vivino total: ${totalMatched})`,
        );
      }

      // Stop if this was the last page of results
      if (matches.length < PAGE_SIZE) break;

      page++;
      await sleep(DELAY_MS + Math.random() * 400);
    }

    console.log(`  Done: ${typeTotal} wines for ${wt.label}`);
    grandTotal += typeTotal;

    // Long pause between wine types so Vivino's rate-limit resets
    if (wt !== WINE_TYPES[WINE_TYPES.length - 1]) {
      console.log(`  Pausing ${TYPE_PAUSE_MS / 1000}s before next type…`);
      await sleep(TYPE_PAUSE_MS);
    }
  }

  console.log(`\n✓ Sync complete — ${grandTotal} wines total`);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
