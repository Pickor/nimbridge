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
 * quarter), update the constants below from the same sources the user uses:
 *   - Diamonds: https://www.pricescope.com/diamond-prices/diamond-prices-chart/
 *   - Gold/Silver: https://guldpris.se (London Fix column = spot)
 */

// ── FX (rough cross rates; refresh when material) ─────────────────────────
// 1 unit of currency = N EUR
const EUR_PER: Record<string, number> = {
  EUR: 1,
  USD: 0.93,
  SEK: 0.087,
  NOK: 0.085,
  DKK: 0.134,
  GBP: 1.17,
};

function toEur(amount: number, fromCcy: string): number {
  const rate = EUR_PER[fromCcy.toUpperCase()];
  if (!rate) return amount; // unknown ccy → assume already EUR
  return amount * rate;
}

// ── Gold (SEK / g, London Fix; user's table) ──────────────────────────────
const GOLD_SEK_PER_G: Record<string, number> = {
  "24":   1363.55,
  "22":   1227.20, // not in user's table but close to 21.6K
  "21.6": 1227.20,
  "21":   1227.20,
  "18":   1022.66,
  "14":   795.40,
  "9":    511.33,
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
  const sekPerG = GOLD_SEK_PER_G[karat];
  if (!sekPerG) return null;
  return toEur(sekPerG * grams, "SEK");
}

// ── Silver (SEK / g, London Fix; user's table) ────────────────────────────
const SILVER_SEK_PER_G: Record<number, number> = {
  830: 18.48,
  925: 20.59,
  400: 8.90,  // mynt
  600: 13.36,
  800: 17.81,
  900: 20.03,
};

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
