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

/**
 * Parse the karat number from a gold lot's title.
 * Catawiki convention: "18 kt." / "18K" / "14 kt".  Returns the karat
 * as a string ("18", "14", "21.6", …) so dotted variants survive.
 */
export function parseGoldKarat(title: string): string | null {
  const k = title.match(/\b(\d{1,2}(?:[.,]\d)?)\s*(?:kt|K|karat)\b/i);
  return k ? k[1]!.replace(",", ".") : null;
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

/** Parse silver purity (925 / 830 / 900 / 800 / 600 / 400) from the title. */
export function parseSilverPurity(title: string): number | null {
  const m = title.match(/\b(?:silver\s*)?(925|830|900|800|600|400)\b/i);
  return m ? parseInt(m[1]!, 10) : null;
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

// ── Diamonds ──────────────────────────────────────────────────────────────
//
// Per-carat USD prices for ROUND BRILLIANTS at the 0.9-1.0 ct tier
// (~Pricescope mid-range), then scaled by carat size and shape. The
// previous values were calibrated to retail asking prices and were
// roughly 2-3× too high; this table is calibrated against a user-supplied
// Pricescope data point: 1.01 ct G VVS2 Heart should land near $3,346/ct
// total, which back-solves to ~$5,500/ct round + 0.60 heart factor.
const DIAMOND_USD_PER_CT_AT_1CT: Record<string, Record<string, number>> = {
  D: { IF: 13200, VVS1: 11000, VVS2: 8800, VS1: 7500, VS2: 6200, SI1: 4800, SI2: 4000, I1: 2600 },
  E: { IF: 11500, VVS1:  9700, VVS2: 7700, VS1: 6500, VS2: 5400, SI1: 4200, SI2: 3500, I1: 2300 },
  F: { IF:  9900, VVS1:  8300, VVS2: 6600, VS1: 5600, VS2: 4600, SI1: 3600, SI2: 3000, I1: 2000 },
  G: { IF:  8200, VVS1:  6900, VVS2: 5500, VS1: 4700, VS2: 3850, SI1: 3000, SI2: 2500, I1: 1650 },
  H: { IF:  7000, VVS1:  5900, VVS2: 4700, VS1: 4000, VS2: 3300, SI1: 2600, SI2: 2100, I1: 1400 },
  I: { IF:  5800, VVS1:  4800, VVS2: 3850, VS1: 3300, VS2: 2700, SI1: 2100, SI2: 1700, I1: 1150 },
  J: { IF:  4500, VVS1:  3800, VVS2: 3000, VS1: 2600, VS2: 2100, SI1: 1700, SI2: 1400, I1:  900 },
  K: { IF:  3700, VVS1:  3100, VVS2: 2500, VS1: 2100, VS2: 1700, SI1: 1400, SI2: 1100, I1:  750 },
};

// Carat-size factor vs the 1ct base. Small stones have lower per-carat
// prices, large stones higher.
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

// Shape factor vs round brilliant. Pricescope-style ratios — fancy shapes
// trade well below round across all tiers.
const DIAMOND_SHAPE_FACTOR: Record<DiamondShape, number> = {
  round:    1.00,
  princess: 0.80,
  cushion:  0.72,
  emerald:  0.68,
  asscher:  0.66,
  oval:     0.70,
  pear:     0.65,
  marquise: 0.62,
  radiant:  0.72,
  heart:    0.60,
  other:    0.65,
};

export type DiamondShape =
  | "round" | "princess" | "cushion" | "emerald" | "asscher"
  | "oval" | "pear" | "marquise" | "radiant" | "heart" | "other";

function parseDiamondShape(title: string): DiamondShape {
  const t = title.toLowerCase();
  if (/\b(round|brilliant)\b/.test(t))                  return "round";
  if (/\bprincess\b/.test(t))                           return "princess";
  if (/\b(cushion|old\s*mine)\b/.test(t))               return "cushion";
  if (/\basscher\b/.test(t))                            return "asscher";
  if (/\bemerald\b/.test(t) && !/\bemerald.*shape\b/.test(t)) {
    // "Emerald" is also a gemstone — only treat as shape when it's a known
    // diamond shape word in a diamond context. Catawiki uses "Emerald" as
    // shape for diamond cuts, so just match the word here.
    return "emerald";
  }
  if (/\boval\b/.test(t))                               return "oval";
  if (/\b(pear|teardrop)\b/.test(t))                    return "pear";
  if (/\bmarquise\b/.test(t))                           return "marquise";
  if (/\bradiant\b/.test(t))                            return "radiant";
  if (/\bheart\b/.test(t))                              return "heart";
  return "other";
}

export interface DiamondGrade {
  carat: number;
  shape: DiamondShape;
  color: string;     // D..N
  clarity: string;   // IF / VVS1 / VVS2 / VS1 / VS2 / SI1 / SI2 / I1 / I2 / I3
}

export function parseDiamondGrade(title: string): DiamondGrade | null {
  const caratMatch = title.match(/(\d+(?:[.,]\d+)?)\s*ct\b/i);
  if (!caratMatch) return null;
  const carat = parseFloat(caratMatch[1]!.replace(",", "."));

  // Colour: standalone capital D-N letter, usually wrapped in " - X -"
  const colorMatch = title.match(/\s-\s([D-N])\s-\s/);
  if (!colorMatch) return null;

  const clarityMatch = title.match(/\b(IF|FL|VVS1|VVS2|VS1|VS2|SI1|SI2|I1|I2|I3)\b/);
  if (!clarityMatch) return null;

  return {
    carat,
    shape: parseDiamondShape(title),
    color: colorMatch[1]!,
    clarity: clarityMatch[1]!,
  };
}

function valueDiamondEur(title: string): number | null {
  const g = parseDiamondGrade(title);
  if (!g) return null;
  const colorRow = DIAMOND_USD_PER_CT_AT_1CT[g.color];
  if (!colorRow) return null;
  // Treat FL same as IF (similar tier; rare in titles).
  const cl = g.clarity === "FL" ? "IF" : g.clarity;
  const usdPerCt = colorRow[cl];
  if (!usdPerCt) return null;
  const totalUsd =
    g.carat * usdPerCt * diamondCaratFactor(g.carat) * DIAMOND_SHAPE_FACTOR[g.shape];
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
