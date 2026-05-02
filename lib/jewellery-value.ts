/**
 * Estimated material/stone value for a jewellery lot.
 *
 * Three parsers + lookup tables, one per sub-vertical (diamonds / gold /
 * silver). Each returns a value in EUR (matching the rest of the listings
 * pipeline, which stores everything in EUR before converting to the user's
 * display currency in the row component).
 *
 * Numbers are intentionally rough — they're a sanity check to compare
 * against the auction bid, not a formal appraisal.
 *
 * Update process: when the underlying market moves materially (or once a
 * quarter), update the constants below from these sources:
 *   - Diamonds: https://www.pricescope.com/diamond-prices/diamond-prices-chart/
 *   - Yellow gold + silver: https://guldpris.se (London Fix column = spot)
 *   - White gold:           Pricescope retail ranges (USD/g)
 *   - Rose gold:            Swedish dealer ranges (SEK/g; see notes below)
 */

// ── FX + spot prices ──────────────────────────────────────────────────────
// Yellow gold + silver SEK/g and FX rates come from lib/daily-rates.ts,
// which is regenerated daily by scraper/sync-rates.ts.
import {
  GOLD_SEK_PER_G as GOLD_SEK_PER_G_DAILY,
  SILVER_SEK_PER_G as SILVER_SEK_PER_G_DAILY,
  EUR_PER as EUR_PER_DAILY,
} from "./daily-rates";

const EUR_PER = EUR_PER_DAILY;

function toEur(amount: number, fromCcy: string): number {
  const rate = EUR_PER[fromCcy.toUpperCase()];
  if (!rate) return amount; // unknown ccy → assume already EUR
  return amount * rate;
}

// ── Weight extraction ─────────────────────────────────────────────────────

const WEIGHT_RE = /(?<![A-Za-z])(\d+(?:[.,]\d+)?)\s*(?:g|gr|gram|gramme|gms?)\b/i;

/**
 * Extract weight in grams from a lot's title or — as fallback — from any of
 * its Catawiki specifications rows whose name looks weight-y. Returns null
 * if nothing parseable is found.
 */
export function extractWeightGrams(
  title: string,
  specifications: Array<{ name: string; value: string }> | null = null,
): number | null {
  const fromTitle = title.match(WEIGHT_RE);
  if (fromTitle) return parseFloat(fromTitle[1].replace(",", "."));

  if (specifications) {
    for (const s of specifications) {
      const n = s.name.toLowerCase();
      if (
        n.includes("weight") || n.includes("vikt") ||
        n.includes("gewicht") || n.includes("poids") || n.includes("peso")
      ) {
        const m = s.value.match(WEIGHT_RE);
        if (m) return parseFloat(m[1].replace(",", "."));
      }
    }
  }
  return null;
}

// ── Gold colour ───────────────────────────────────────────────────────────

export type GoldColor = "white" | "yellow" | "rose" | "mixed";

/**
 * Pick out which colour of gold is referenced in a title. Catawiki titles
 * are explicit about this ("18 kt. Yellow gold"). A title that names two
 * or more colours, or uses words like "tri-colour" / "mixed gold",
 * returns "mixed".
 */
export function parseGoldColor(title: string): GoldColor | null {
  const t = title.toLowerCase();
  if (/\b(bi|tri|two|three)[-\s]colou?red?\b|\bmixed\s*gold\b/.test(t)) return "mixed";
  const hasWhite  = /\bwhite\s*gold\b/.test(t);
  const hasYellow = /\byellow\s*gold\b/.test(t);
  const hasRose   = /\b(?:rose|pink|red)\s*gold\b/.test(t);
  const count = [hasWhite, hasYellow, hasRose].filter(Boolean).length;
  if (count > 1) return "mixed";
  if (hasWhite)  return "white";
  if (hasYellow) return "yellow";
  if (hasRose)   return "rose";
  return null;
}

// ── Gold price tables (EUR / g, by colour × karat) ────────────────────────
//
// Stored in EUR/g internally so the row component doesn't have to care
// where each row sourced its price.  Sources:
//
//   yellow: guldpris.se London Fix (SEK/g × 0.087)
//             24K   1363.55 → 118.63
//             21.6K 1227.20 → 106.77   (also covers 21K / 22K)
//             18K   1022.66 →  88.97
//             14K    795.40 →  69.20
//             9K     511.33 →  44.49
//
//   white:  Pricescope retail ranges, midpoint (USD/g × 0.93)
//             18K  ~$110/g → 102.45
//             14K  ~$82/g  →  76.04
//             10K  ~$59/g  →  55.03
//
//   rose:   Swedish dealer ranges, midpoint (SEK/g × 0.087)
//             18K   ~950 SEK/g → 82.65
//             14K   ~735 SEK/g → 63.99
//             (rose gold isn't commonly produced at 21+ K — too soft once
//              the copper alloy is reduced — so we leave those blank.)
//
//   mixed:  same numbers as yellow (most common base alloy when the parser
//           can't pin one colour down).
//
// Karats not listed for a given colour fall back to the yellow column.

// Yellow-gold EUR/g built from the live SEK Pengar-direkt rates × the
// SEK→EUR FX rate. Mixed gold uses the same numbers (most common base).
function yellowGoldEurPerG(): Record<string, number> {
  const r: Record<string, number> = {};
  for (const [k, sek] of Object.entries(GOLD_SEK_PER_G_DAILY)) {
    r[k] = sek * EUR_PER_DAILY.SEK;
  }
  return r;
}
const YELLOW_GOLD: Record<string, number> = yellowGoldEurPerG();

const GOLD_EUR_PER_G: Record<GoldColor, Record<string, number>> = {
  yellow: YELLOW_GOLD,
  // White gold is driven by USD retail (Pricescope-style midpoints), not
  // kaplans — kept static and re-converted from USD on every load.
  white: {
    "18": 110 * EUR_PER_DAILY.USD,
    "14":  82 * EUR_PER_DAILY.USD,
    "10":  59 * EUR_PER_DAILY.USD,
  },
  // Rose gold uses Swedish dealer ranges (different source than kaplans);
  // re-converted from SEK on every load.
  rose: {
    "18": 950 * EUR_PER_DAILY.SEK,
    "14": 735 * EUR_PER_DAILY.SEK,
  },
  mixed: YELLOW_GOLD,
};

function parseGoldKarat(title: string): string | null {
  // "18 kt." / "18K" / "18 K" / "14 kt"
  const k = title.match(/\b(\d{1,2}(?:[.,]\d)?)\s*(?:kt|K|karat)\b/i);
  return k ? k[1].replace(",", ".") : null;
}

function valueGoldEur(
  title: string,
  specifications: Array<{ name: string; value: string }> | null,
): number | null {
  const karat = parseGoldKarat(title);
  const grams = extractWeightGrams(title, specifications);
  if (!karat || grams == null) return null;
  // If no colour parsed, default to yellow (most common, conservative-ish).
  const colour: GoldColor = parseGoldColor(title) ?? "yellow";
  // Try colour-specific price; fall back to yellow if that karat isn't in
  // the colour-specific table (e.g. 24K rose gold doesn't exist commercially).
  const eurPerG = GOLD_EUR_PER_G[colour][karat] ?? YELLOW_GOLD[karat];
  if (!eurPerG) return null;
  return eurPerG * grams;
}

// Silver SEK/g comes straight from the daily kaplans fetch (Pengar direkt
// column).
const SILVER_SEK_PER_G = SILVER_SEK_PER_G_DAILY;

function parseSilverPurity(title: string): number | null {
  const m = title.match(/\b(?:silver\s*)?(925|830|900|800|600|400)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function valueSilverEur(
  title: string,
  specifications: Array<{ name: string; value: string }> | null,
): number | null {
  const purity = parseSilverPurity(title);
  const grams = extractWeightGrams(title, specifications);
  if (!purity || grams == null) return null;
  const sekPerG = SILVER_SEK_PER_G[purity];
  if (!sekPerG) return null;
  return toEur(sekPerG * grams, "SEK");
}

// ── Diamonds (USD / ct, Pricescope-style; round-brilliant midpoints) ──────
//
// Per-carat USD prices for round brilliants at the 0.9-1.0 ct tier. Smaller
// or larger stones scale via DIAMOND_CARAT_FACTOR. Values are MIDPOINTS of
// the typical Pricescope range — undervalued findings should still beat
// these numbers.
const DIAMOND_USD_PER_CT_AT_1CT: Record<string, Record<string, number>> = {
  D: { IF: 28000, VVS1: 25000, VVS2: 22000, VS1: 18000, VS2: 15000, SI1: 12000, SI2:  9000, I1: 5000 },
  E: { IF: 24000, VVS1: 22000, VVS2: 20000, VS1: 16000, VS2: 13000, SI1: 11000, SI2:  8500, I1: 4500 },
  F: { IF: 22000, VVS1: 20000, VVS2: 18000, VS1: 14500, VS2: 12000, SI1: 10000, SI2:  8000, I1: 4200 },
  G: { IF: 18000, VVS1: 17000, VVS2: 15000, VS1: 12500, VS2: 10500, SI1:  9000, SI2:  7000, I1: 3800 },
  H: { IF: 15000, VVS1: 14000, VVS2: 12500, VS1: 10500, VS2:  9000, SI1:  7500, SI2:  6000, I1: 3500 },
  I: { IF: 12500, VVS1: 11500, VVS2: 10500, VS1:  9000, VS2:  7800, SI1:  6500, SI2:  5200, I1: 3000 },
  J: { IF: 10500, VVS1: 10000, VVS2:  9000, VS1:  8000, VS2:  7000, SI1:  5800, SI2:  4600, I1: 2700 },
  K: { IF:  8500, VVS1:  8000, VVS2:  7500, VS1:  6800, VS2:  6000, SI1:  5000, SI2:  4000, I1: 2300 },
};

// Multiplier vs the 1ct base to model that small diamonds have lower
// per-carat prices and large diamonds have higher.
function diamondCaratFactor(ct: number): number {
  if (ct < 0.30) return 0.30;
  if (ct < 0.50) return 0.45;
  if (ct < 0.70) return 0.60;
  if (ct < 1.00) return 0.80;
  if (ct < 1.50) return 1.00;
  if (ct < 2.00) return 1.20;
  if (ct < 3.00) return 1.50;
  return 1.80;
}

function parseDiamond(title: string): { carat: number; color: string; clarity: string } | null {
  const caratMatch = title.match(/(\d+(?:[.,]\d+)?)\s*ct\b/i);
  if (!caratMatch) return null;
  const carat = parseFloat(caratMatch[1].replace(",", "."));

  // Color is a standalone capital D-N letter, usually surrounded by hyphens
  // like "- J -" or "- G -".
  const colorMatch = title.match(/\s-\s([D-N])\s-\s/);
  if (!colorMatch) return null;

  const clarityMatch = title.match(/\b(IF|FL|VVS1|VVS2|VS1|VS2|SI1|SI2|I1|I2|I3)\b/);
  if (!clarityMatch) return null;

  return { carat, color: colorMatch[1], clarity: clarityMatch[1] };
}

function valueDiamondEur(title: string): number | null {
  const m = parseDiamond(title);
  if (!m) return null;
  const colorRow = DIAMOND_USD_PER_CT_AT_1CT[m.color];
  if (!colorRow) return null;
  // Treat FL same as IF (rare, similar price tier)
  const cl = m.clarity === "FL" ? "IF" : m.clarity;
  const usdPerCt = colorRow[cl];
  if (!usdPerCt) return null;
  const totalUsd = m.carat * usdPerCt * diamondCaratFactor(m.carat);
  return toEur(totalUsd, "USD");
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Estimate the underlying material/stone value of a lot (in EUR).
 * Returns null when the title doesn't match any of the known shapes —
 * e.g. a non-diamond gemstone, or a piece without an explicit weight.
 */
export function estimateJewelleryValueEur(
  title: string,
  catawikiCategoryId: number | null,
  catawikiSubcategoryId: number | null,
  specifications: Array<{ name: string; value: string }> | null = null,
): number | null {
  // Diamonds (own top-level category) — carat is the weight, no specs needed.
  if (catawikiCategoryId === 715) {
    return valueDiamondEur(title);
  }
  // Jewellery main; subcategory tells us metal.
  if (catawikiCategoryId === 313) {
    if (catawikiSubcategoryId === 1660) return valueGoldEur(title, specifications);
    if (catawikiSubcategoryId === 841)  return valueSilverEur(title, specifications);
  }
  return null;
}
