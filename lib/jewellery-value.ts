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
  weightGramsOverride: number | null = null,
): number | null {
  const karat = parseGoldKarat(title);
  // Prefer the explicit override (used by /history, where auction_results
  // has a populated weight_g column but no specifications JSONB) and only
  // fall back to title/spec extraction otherwise.
  const grams = weightGramsOverride ?? extractWeightGrams(title, specifications);
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
  weightGramsOverride: number | null = null,
): number | null {
  const purity = parseSilverPurity(title);
  const grams = weightGramsOverride ?? extractWeightGrams(title, specifications);
  if (!purity || grams == null) return null;
  const sekPerG = SILVER_SEK_PER_G[purity];
  if (!sekPerG) return null;
  return toEur(sekPerG * grams, "SEK");
}

// ── Diamonds ──────────────────────────────────────────────────────────────
//
// Pricing model: anchor × color factor × clarity factor × carat × shape × carat-size band.
//
//   anchor: USD per carat for a 1ct G VVS2 round brilliant
//   color factor:   D → 1.60   K → 0.45   N → 0.24   fancy → 0.50
//   clarity factor: IF → 1.50  VVS2 → 1.00  SI2 → 0.45  I3 → 0.10
//
// Calibrated against the user-supplied Pricescope data point:
// 1.01 ct G VVS2 Heart  →  ≈$3,346 total per Pricescope
// matches anchor 5500 × shape factor 0.60 (heart) ≈ $3,333. ✓
//
// "fancy" handles all "Fancy …" colors (yellow, brown, pink, …) with one
// mid-range factor. Coloured diamonds vary wildly so this is a sanity
// number, not an appraisal.

const DIAMOND_ANCHOR_USD_PER_CT = 5500;

const DIAMOND_COLOR_FACTOR: Record<string, number> = {
  D: 1.60, E: 1.40, F: 1.20, G: 1.00, H: 0.85, I: 0.70, J: 0.55, K: 0.45,
  L: 0.36, M: 0.30, N: 0.24, O: 0.20, P: 0.18, Q: 0.16, R: 0.14, S: 0.13,
  T: 0.12, U: 0.11, V: 0.10, W: 0.10, X: 0.10, Y: 0.10, Z: 0.10,
  fancy: 0.50,
};

const DIAMOND_CLARITY_FACTOR: Record<string, number> = {
  IF: 1.50, FL: 1.50,
  VVS1: 1.25, VVS2: 1.00,
  VS1: 0.85, VS2: 0.70,
  SI1: 0.55, SI2: 0.45,
  I1: 0.30, I2: 0.20, I3: 0.10,
};

function diamondUsdPerCtAt1Ct(color: string, clarity: string): number | null {
  const c = DIAMOND_COLOR_FACTOR[color];
  const cl = DIAMOND_CLARITY_FACTOR[clarity];
  if (c == null || cl == null) return null;
  return DIAMOND_ANCHOR_USD_PER_CT * c * cl;
}

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

/** Pick out the colour grade from a Catawiki diamond title. */
function parseDiamondColor(title: string): string | null {
  // 1. Fancy colours win — Catawiki spells them out ("Fancy Yellow",
  //    "Fancy Deep Greyish Greenish Yellow", etc.). The exact hue varies
  //    too much to map; collapse them all to one "fancy" pricing tier.
  if (/\bFancy\b/i.test(title)) return "fancy";

  // 2. Colour range like " - O-P" (very-near-colourless to faint yellow):
  //    take the higher (better) letter, since dealers price ranges that way.
  const range = title.match(/\s[-–]\s([D-Z])\s*[-–]\s*([D-Z])(?:\s|$)/);
  if (range) return range[1]!;

  // 3. Letter with a trailing parenthetical like "D (colourless)" /
  //    "K (faint yellow)" — strip the gloss, keep the letter.
  const withParen = title.match(/\s[-–]\s([D-Z])\s*\([^)]+\)/);
  if (withParen) return withParen[1]!;

  // 4. Standalone letter surrounded by hyphen-space on the left and either
  //    a hyphen-space or end-of-string on the right.
  const single = title.match(/\s[-–]\s([D-Z])(?=\s[-–]\s|\s*$)/);
  if (single) return single[1]!;

  return null;
}

export function parseDiamondGrade(title: string): DiamondGrade | null {
  const caratMatch = title.match(/(\d+(?:[.,]\d+)?)\s*ct\b/i);
  if (!caratMatch) return null;
  const carat = parseFloat(caratMatch[1]!.replace(",", "."));

  const color = parseDiamondColor(title);
  if (!color) return null;

  const clarityMatch = title.match(/\b(IF|FL|VVS1|VVS2|VS1|VS2|SI1|SI2|I1|I2|I3)\b/);
  if (!clarityMatch) return null;

  return {
    carat,
    shape: parseDiamondShape(title),
    color,
    clarity: clarityMatch[1]!,
  };
}

function valueDiamondEur(title: string): number | null {
  const g = parseDiamondGrade(title);
  if (!g) return null;
  const usdPerCt = diamondUsdPerCtAt1Ct(g.color, g.clarity);
  if (usdPerCt == null) return null;
  const totalUsd =
    g.carat * usdPerCt * diamondCaratFactor(g.carat) * DIAMOND_SHAPE_FACTOR[g.shape];
  return toEur(totalUsd, "USD");
}

// ── Diamond certificate / lab report ──────────────────────────────────────

/**
 * Stable code for each diamond grading lab we filter by. The order also
 * drives the filter pill row in the dashboard.
 */
export const DIAMOND_CERT_LABS = [
  "IGI",
  "GIA",
  "GCI",
  "GRA",
  "GWLAB",
  "HDR",
] as const;
export type DiamondCertLab = typeof DIAMOND_CERT_LABS[number];

/**
 * Per-lab regex.  We match against title + every spec value (Catawiki
 * usually puts the lab name on a "Laboratory report" / "Certificate"
 * spec row).  Each pattern is generous about full-name spellings,
 * dotted abbreviations, and casing — diamond sellers are inconsistent.
 */
const DIAMOND_CERT_PATTERNS: Record<DiamondCertLab, RegExp> = {
  // IGI = "IGI" or "International Gemological Institute"
  IGI:   /\bIGI\b|International\s+Gemmological?\s+Institute/i,
  // GIA = "GIA" or "Gemological Institute of America"
  GIA:   /\bGIA\b|Gem(?:m)?ological\s+Institute\s+(?:of\s+)?America/i,
  // G.C.I = "Gemmological Centre Israel" or "GCI" / "G.C.I"
  GCI:   /\bG\.?C\.?I\b|Gem(?:m)?ological\s+Cent(?:re|er)\s+Israel/i,
  // GRA = "Gem Report Antwerp" or "GRA"
  GRA:   /\bGRA\b|Gem\s+Report\s+Antwerp/i,
  // GWLAB = "GWLAB" or "Gemewizard Gemological Laboratory"
  GWLAB: /\bGWLAB\b|Gemewizard\s+Gem(?:m)?ological\s+Laboratory/i,
  // HDR Antwerp = "HDR Antwerp" or "HDRAntwerp"
  HDR:   /\bHDR\s*Antwerp\b/i,
};

/** Pretty label for the filter pill. Keeps the user-facing dot in "G.C.I". */
export const DIAMOND_CERT_LABEL: Record<DiamondCertLab, string> = {
  IGI:   "IGI",
  GIA:   "GIA",
  GCI:   "G.C.I",
  GRA:   "GRA",
  GWLAB: "GWLAB",
  HDR:   "HDR Antwerp",
};

/**
 * Identify which grading lab certified a diamond lot.
 * Looks at the lot title plus every specification row's name+value
 * (Catawiki's "Laboratory report" / "Certificate" rows).  Returns
 * the first match in `DIAMOND_CERT_LABS` order, or null when no lab
 * can be identified — meaning the seller didn't disclose one.
 */
export function parseDiamondCertificate(
  title: string,
  specifications: Array<{ name: string; value: string }> | null = null,
): DiamondCertLab | null {
  // Build one haystack — title + every spec name/value joined by newlines.
  // Newlines stop word-boundary matches from leaking across rows.
  const haystack = [
    title,
    ...((specifications ?? []).flatMap((s) => [s.name, s.value])),
  ].join("\n");

  for (const lab of DIAMOND_CERT_LABS) {
    if (DIAMOND_CERT_PATTERNS[lab].test(haystack)) return lab;
  }
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
  weightGramsOverride: number | null = null,
): number | null {
  // Diamonds (own top-level category) — carat is the weight, no specs needed.
  if (catawikiCategoryId === 715) {
    return valueDiamondEur(title);
  }
  // Jewellery main; subcategory tells us metal.
  if (catawikiCategoryId === 313) {
    if (catawikiSubcategoryId === 1660) return valueGoldEur(title, specifications, weightGramsOverride);
    if (catawikiSubcategoryId === 841)  return valueSilverEur(title, specifications, weightGramsOverride);
  }
  return null;
}
