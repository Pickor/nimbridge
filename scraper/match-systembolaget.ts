/**
 * Fuzzy-match Catawiki auction listings against Systembolaget products.
 * Sets sb_product_id + sb_price on matched listings.
 *
 * Algorithm:
 *  1. Normalise & tokenise both strings (strip diacritics, lowercase, split on non-alphanum)
 *  2. Build an inverted index (word → SB product indices) for fast candidate lookup
 *  3. Score candidates using Jaccard similarity on word bags
 *  4. Apply penalties when age numbers or vintages differ
 *  5. Accept the best match if score ≥ THRESHOLD
 *
 * Run: npx tsx scraper/match-systembolaget.ts
 */
import { createClient } from "@supabase/supabase-js";
import { sleep } from "./catawiki";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SCORE_THRESHOLD = 0.28; // minimum Jaccard to accept a match
const BATCH_WRITE     = 50;   // DB updates per batch

// ── String helpers ───────────────────────────────────────────────────────────

/** Lowercase, strip diacritics, replace non-alphanumeric with space */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s).split(" ").filter((w) => w.length > 1);
}

function tokenSet(s: string): Set<string> {
  return new Set(tokenize(s));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

/** Extract 4-digit calendar years (1900–2030) */
function extractYears(s: string): number[] {
  return (normalize(s).match(/\b(19\d\d|20[012]\d)\b/g) ?? []).map(Number);
}

/** Extract non-year numbers (e.g. age statements: 12, 18, 25) */
function extractNums(s: string): number[] {
  return (normalize(s).match(/\b\d{1,3}\b/g) ?? [])
    .map(Number)
    .filter((n) => n < 200); // exclude years-ish large numbers
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SBProduct {
  id:        string;
  name_bold: string;
  name_thin: string | null;
  price:     number;
  vintage:   number | null;
  // pre-computed:
  fullName:  string;
  tokens:    Set<string>;
  years:     number[];
  nums:      number[];
}

interface ListingRow {
  id:                    string;
  title:                 string;
  catawiki_category_id:  number | null;
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function score(listing: ListingRow, sb: SBProduct): number {
  const lTokens = tokenSet(listing.title);
  let s = jaccard(lTokens, sb.tokens);
  if (s < 0.08) return 0; // fast early-out

  const lNums  = extractNums(listing.title);
  const lYears = extractYears(listing.title);

  // Penalise age-number mismatch (e.g. "18 Year Old" vs "25 Year Old")
  if (sb.nums.length > 0 && lNums.length > 0) {
    const overlap = lNums.some((n) => sb.nums.includes(n));
    if (!overlap) s *= 0.35;
  }

  // Penalise vintage mismatch (wine: "2015" vs "2010")
  const sbYears = sb.years.length > 0 ? sb.years : (sb.vintage ? [sb.vintage] : []);
  if (sbYears.length > 0 && lYears.length > 0) {
    const overlap = lYears.some((y) => sbYears.includes(y));
    if (!overlap) s *= 0.2;
  }

  return s;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Match Systembolaget products ===");
  console.log(new Date().toISOString());
  console.log();

  // 1. Load ALL SB products (paginate past the 1 000-row default limit)
  console.log("Loading SB products …");
  const allSBRaw: Record<string, unknown>[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("systembolaget_products")
      .select("id, name_bold, name_thin, price, vintage")
      .range(from, from + PAGE - 1);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allSBRaw.push(...data);
    if (data.length < PAGE) break;
  }
  const sbRaw = allSBRaw;

  const sbProducts: SBProduct[] = (sbRaw ?? []).map((p) => {
    const raw = p as { id: string; name_bold: string; name_thin: string | null; price: number; vintage: number | null };
    const fullName = `${raw.name_bold} ${raw.name_thin ?? ""}`.trim();
    return {
      id:       raw.id,
      name_bold: raw.name_bold,
      name_thin: raw.name_thin,
      price:    raw.price,
      vintage:  raw.vintage,
      fullName,
      tokens:  tokenSet(fullName),
      years:   extractYears(fullName),
      nums:    extractNums(fullName),
    };
  });
  console.log(`Loaded ${sbProducts.length} SB products`);

  // 2. Build inverted index: word → SB product indices
  const wordIndex = new Map<string, number[]>();
  for (let i = 0; i < sbProducts.length; i++) {
    for (const word of sbProducts[i].tokens) {
      const arr = wordIndex.get(word);
      if (arr) arr.push(i);
      else wordIndex.set(word, [i]);
    }
  }

  // 3. Load listings without a match yet (up to 5 000 at a time)
  console.log("Loading unmatched listings …");
  const { data: listings, error: lErr } = await db
    .from("listings")
    .select("id, title, catawiki_category_id")
    .is("sb_product_id", null)
    .limit(5000);
  if (lErr) { console.error(lErr.message); process.exit(1); }
  console.log(`Found ${listings!.length} unmatched listings\n`);

  // 4. Match
  let matched   = 0;
  let unmatched = 0;
  const updates: { id: string; sb_product_id: string; sb_price: number }[] = [];

  for (let i = 0; i < listings!.length; i++) {
    const listing = listings![i];

    // Candidate SB products that share at least one token with the title
    const candidateIndices = new Set<number>();
    for (const word of tokenize(listing.title)) {
      const idxs = wordIndex.get(word);
      if (idxs) idxs.forEach((idx) => candidateIndices.add(idx));
    }

    let bestScore = 0;
    let bestSB: SBProduct | null = null;

    for (const idx of candidateIndices) {
      const s = score(listing, sbProducts[idx]);
      if (s > bestScore) { bestScore = s; bestSB = sbProducts[idx]; }
    }

    const line = `[${i + 1}/${listings!.length}] `.padEnd(12);
    if (bestSB && bestScore >= SCORE_THRESHOLD) {
      process.stdout.write(
        `\r${line}✓ ${bestSB.fullName.padEnd(50).slice(0, 50)} (${bestScore.toFixed(2)}) → ${bestSB.price} kr`
          .padEnd(100)
      );
      updates.push({ id: listing.id, sb_product_id: bestSB.id, sb_price: bestSB.price });
      matched++;
    } else {
      process.stdout.write(
        `\r${line}— ${listing.title.slice(0, 50).padEnd(50)} (best ${bestScore.toFixed(2)})`
          .padEnd(100)
      );
      unmatched++;
    }

    // Flush writes in batches
    if (updates.length >= BATCH_WRITE) {
      await flushUpdates(updates.splice(0));
    }
  }

  // Final flush
  if (updates.length > 0) await flushUpdates(updates.splice(0));

  console.log("\n");
  console.log("=== Summary ===");
  console.log(`Total     : ${listings!.length}`);
  console.log(`Matched   : ${matched}`);
  console.log(`Unmatched : ${unmatched}`);
}

async function flushUpdates(
  updates: { id: string; sb_product_id: string; sb_price: number }[],
) {
  for (const u of updates) {
    const { error } = await db
      .from("listings")
      .update({ sb_product_id: u.sb_product_id, sb_price: u.sb_price })
      .eq("id", u.id);
    if (error) console.error(`\nUpdate error (${u.id}): ${error.message}`);
  }
  await sleep(100);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
