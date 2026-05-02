/**
 * Print active-listing counts per (category, subcategory). Used to
 * snapshot before/after a full recrawl.
 */
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Mirrors the matrix in .github/workflows/crawler.yml so the report uses
// the same human labels the workflow reports.
const MATRIX: { cat: number; sub: number | null; label: string }[] = [
  { cat: 437, sub: 441,  label: "Exclusive Whisky" },
  { cat: 437, sub: 1475, label: "Japanese & Asian Whisky" },
  { cat: 437, sub: 461,  label: "Regular Whisky" },
  { cat: 965, sub: 705,  label: "Rum" },
  { cat: 965, sub: 1477, label: "Exclusive Rum" },
  { cat: 965, sub: 615,  label: "Cognac & Armagnac" },
  { cat: 965, sub: 1503, label: "Exclusive Cognac" },
  { cat: 965, sub: 967,  label: "Fine Spirits" },
  { cat: 965, sub: 1638, label: "Chartreuse" },
  { cat: 443, sub: 447,  label: "Exclusive Wine" },
  { cat: 443, sub: 695,  label: "Bordeaux Grand Cru" },
  { cat: 443, sub: 765,  label: "Burgundy Crus" },
  { cat: 443, sub: 463,  label: "Premium Wine" },
  { cat: 443, sub: 1025, label: "Italian Wine" },
  { cat: 443, sub: 1473, label: "Rhone Valley Wine" },
  { cat: 443, sub: 937,  label: "Spanish & Portuguese Wine" },
  { cat: 443, sub: 737,  label: "Big Bottles Wine" },
  { cat: 961, sub: 613,  label: "Champagne" },
  { cat: 961, sub: 929,  label: "Dom Perignon" },
  { cat: 971, sub: 449,  label: "Port & Madeira" },
  { cat: 971, sub: 973,  label: "Dessert & Sweet Wines" },
  { cat: 963, sub: null, label: "Beer" },
];

async function main() {
  let total = 0;
  console.log(
    "label".padEnd(28) +
    "cat".padStart(6) +
    "sub".padStart(7) +
    "active".padStart(9),
  );
  console.log("─".repeat(28 + 6 + 7 + 9));
  for (const m of MATRIX) {
    let q = db.from("listings").select("*", { count: "exact", head: true })
      .eq("is_active", true).eq("catawiki_category_id", m.cat);
    q = m.sub == null ? q.is("catawiki_subcategory_id", null) : q.eq("catawiki_subcategory_id", m.sub);
    const { count } = await q;
    total += count ?? 0;
    console.log(
      m.label.padEnd(28) +
      String(m.cat).padStart(6) +
      String(m.sub ?? "—").padStart(7) +
      String(count ?? 0).padStart(9),
    );
  }
  console.log("─".repeat(28 + 6 + 7 + 9));
  console.log("TOTAL".padEnd(28 + 6 + 7) + String(total).padStart(9));

  // Total active listings (incl. anything without category)
  const { count: actTotal } = await db.from("listings")
    .select("*", { count: "exact", head: true }).eq("is_active", true);
  if (actTotal !== total) {
    console.log(`(listings.is_active=true total: ${actTotal} — ${(actTotal ?? 0) - total} not in matrix)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
