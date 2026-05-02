/**
 * Tiny utility — prints how many wine/champagne/port rows currently
 * carry a CellarTracker score. Useful as a "pulse check" while the
 * long backfill is running in another window:
 *
 *   npx tsx scraper/check-ct-progress.ts
 */
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const r1 = await db.from("listings").select("*", { count: "exact", head: true }).in("catawiki_category_id", [443, 961, 971]).not("cellartracker_score", "is", null);
  const r2 = await db.from("auction_results").select("*", { count: "exact", head: true }).in("catawiki_category_id", [443, 961, 971]).not("cellartracker_score", "is", null);
  console.log("listings with CT score:", r1.count);
  console.log("auction_results with CT score:", r2.count);
}
main();
