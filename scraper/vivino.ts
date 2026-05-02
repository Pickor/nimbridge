/**
 * Vivino wine rating lookup utilities.
 *
 * Maps Catawiki category IDs to Vivino wine type IDs, cleans lot titles
 * for fuzzy matching, and wraps the Supabase match_vivino_wine() RPC call.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Catawiki category → Vivino wine type IDs ───────────────────────────────
// Only categories where Vivino has data (wine + champagne + port).
// Whisky, rum, cognac, beer → no Vivino data.
export const CATAWIKI_TO_VIVINO: Record<number, number[]> = {
  443: [1, 2],   // Wine          → Red + White
  961: [3],      // Champagne     → Champagne/Sparkling
  971: [24],     // Port & Sweet  → Port/Fortified
};

// Minimum trigram similarity (0–1). Combined with the producer-word filter
// the false-positive rate is very low even at low similarity.
const SIM_THRESHOLD = 0.10;

// Words to skip when looking for the "distinctive" producer-identifying token.
// These are too generic across the Vivino catalogue:
//   – producer prefixes (every Bordeaux producer is a "Château …")
//   – wine-style descriptors that appear in nearly every name
//   – language articles & connectives
const STOPWORDS = new Set([
  // articles / connectives
  "do", "de", "da", "dos", "das", "del", "della", "delle", "di",
  "la", "le", "les", "el", "il", "lo", "los",
  "et", "and", "&", "y", "von", "vom", "of", "the", "den", "der",
  // producer prefixes
  "château", "chateau", "quinta", "domaine", "domain", "bodega",
  "bodegas", "schloss", "cantina", "weingut", "tenuta", "casa",
  "fattoria", "azienda", "maison", "clos",
  // wine-style descriptors / colour / classification
  "cuvée", "cuvee", "reserve", "reserva", "riserva", "grand", "grande",
  "premier", "vintage", "brut", "rouge", "blanc", "blancs", "blanca",
  "blanco", "rosé", "rose", "noir", "noirs", "tinto", "white", "red",
  "especial", "speciale", "special", "selection", "selezione", "edition",
  // wine types / styles
  "champagne", "porto", "port", "sauternes", "barsac", "tawny",
  "colheita", "magnum", "vino", "wine", "vin", "vins", "cru",
  // grape varieties (high-frequency in Vivino names)
  "cabernet", "sauvignon", "merlot", "chardonnay", "pinot", "noir",
  "riesling", "syrah", "shiraz", "tempranillo", "nebbiolo", "barbera",
  "sangiovese", "trebbiano", "grenache", "garnacha", "malbec",
  "viognier", "gewurztraminer", "gewürztraminer", "semillon",
  // regions (when they appear standalone in titles)
  "langhe", "barbaresco", "barolo", "douro", "mosel", "ribera",
  "duero", "rhône", "rhone", "abruzzo", "piedmont", "tuscany",
  "rioja", "navarra", "alto", "adige", "trentino", "bordeaux",
  "burgundy", "bourgogne", "alsace", "loire", "reims", "epernay",
  "hermitage", "crozes", "saintjoseph", "monbazillac", "rivesaltes",
  "piesporter", "savagnin", "arbois", "auslese", "spätlese",
  "sicily", "sardinia", "castile", "león",
]);

/** Strip diacritics and lowercase. */
function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Returns ALL "distinctive" words in the cleaned title — i.e. words at
 * least 4 chars long that are not years, stopwords, or generic prefixes.
 */
function distinctiveWords(cleaned: string): string[] {
  const out: string[] = [];
  for (const raw of cleaned.split(/\s+/)) {
    const w = fold(raw).replace(/[^a-z0-9]/g, "");
    if (w.length < 4) continue;
    if (/^\d+$/.test(w)) continue;
    if (STOPWORDS.has(w)) continue;
    out.push(w);
  }
  return out;
}

// Common Latin first names that show up as the first word of many
// different producers. When the title leads with one of these we require
// a second distinctive word to also appear in the Vivino match, otherwise
// we'd match e.g. "Alejandro Fernandez" → "Alejandro Bulgheroni".
const WEAK_FIRST_NAMES = new Set([
  "alejandro", "alfredo", "antonio", "carlos", "francisco", "fernando",
  "frank", "franck", "jean", "jorge", "joao", "juan", "louis", "luigi",
  "luis", "manuel", "maria", "pedro", "pierre", "rafael", "santiago",
  "jose", "henri", "michel", "olivier", "philippe", "anne", "yves",
]);

// ── Title cleaning ─────────────────────────────────────────────────────────

/**
 * Strips Catawiki lot-title noise so the cleaned string matches Vivino names.
 *
 * Catawiki titles look like:
 *   "Producer, Wine Name - Region - Vintage - N Bottles (0.75L)"
 * Critically, the *wine name* lives after the first comma, so we keep it
 * (replacing commas with spaces) and only strip pure noise: parentheticals,
 * bottle counts, volumes, and trailing region/grade hyphenated suffixes.
 *
 * Examples:
 *   "Krug, Grande Cuvée 3rd Edition - Champagne Brut - 1 Bottle (0.75L)"
 *      → "Krug Grande Cuvée 3rd Edition Champagne Brut"
 *   "Calem 'Velhotes' - 10 years old Tawny - Porto - 9 Bottles (0.75L)"
 *      → "Calem 'Velhotes' 10 years old Tawny Porto"
 *   "2015 Louis Roederer, Cristal - Reims - 1 Bottle (0.75L)"
 *      → "2015 Louis Roederer Cristal Reims"
 */
export function cleanTitleForVivino(title: string): string {
  return title
    .replace(/\(.*?\)/g, "")                                  // remove parenthetical notes
    .replace(/\b\d+(?:\.\d+)?\s*(?:cl|ml|l)\b/gi, "")         // 0.75L, 75cl, 1.5L
    .replace(/\b\d+\s*x\s*\d+\s*(?:cl|ml|l)\b/gi, "")         // 12x75cl
    .replace(/\b\d+\s*(?:fl\.?|bottles?|magnums?|jeroboams?|jennie|imperial)\b/gi, "") // unit counts
    .replace(/[,]/g, " ")                                      // commas → spaces
    .replace(/\s*-\s*$/g, "")                                  // trailing dash
    .replace(/\s*-\s*/g, " ")                                  // hyphens → spaces (Vivino names rarely have them)
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Supabase RPC wrapper ───────────────────────────────────────────────────

export interface VivinoMatch {
  vivino_vintage_id: number;
  vintage_name:      string;
  ratings_average:   number | null;
  ratings_count:     number;
  sim:               number;
}

/**
 * Looks up the best Vivino wine match for a lot title.
 * Returns null if:
 *   – the category has no Vivino wine types
 *   – vivino_wines table is empty
 *   – best match similarity is below threshold
 */
// Use a broad type so any createClient() variant (typed or untyped) works.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lookupVivinoRating(
  db: SupabaseClient<any, any, any>,
  title: string,
  catawikiCategoryId: number,
): Promise<{ rating_avg: number; rating_count: number; vintage_id: number } | null> {
  const typeIds = CATAWIKI_TO_VIVINO[catawikiCategoryId];
  if (!typeIds) return null;   // category not covered by Vivino

  const cleaned = cleanTitleForVivino(title);
  if (!cleaned) return null;

  // Cast to `any` first because the Supabase client has no generated types
  // for match_vivino_wine — it was created in migration 0017.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc("match_vivino_wine", {
    p_title:    cleaned,
    p_type_ids: typeIds,
  }) as { data: VivinoMatch[] | null; error: unknown };

  if (error) {
    console.warn(`  [vivino] RPC error for "${cleaned}":`, error);
    return null;
  }

  // Require the title's distinctive (producer-identifying) words to also
  // appear in the candidate's Vivino vintage_name. Without this filter
  // the trigram match returns nearest-neighbour wines that share generic
  // tokens like "Champagne Brut" but have completely different producers.
  const probes = distinctiveWords(cleaned);
  const candidates = (data ?? []).filter((c) => c.sim >= SIM_THRESHOLD);

  // Producer-match filter:
  //   • the title's leading distinctive word must appear in the match, OR
  //   • at least 2 of the title's distinctive words must appear (covers
  //     titles that lead with an importer name before the real producer)
  //   • when the leader is a generic first name we always require a 2nd hit
  const lead = probes[0];
  const leaderIsWeak = lead !== undefined && WEAK_FIRST_NAMES.has(lead);

  const match = !lead
    ? candidates[0]
    : candidates.find((c) => {
        const name = fold(c.vintage_name);
        const hits = probes.filter((p) => name.includes(p));
        const hasLead = name.includes(lead);
        if (leaderIsWeak) return hasLead && hits.length >= 2;
        return hasLead || hits.length >= 2;
      });
  if (!match) return null;

  console.log(
    `  [vivino] "${cleaned}" → "${match.vintage_name}" ` +
    `sim=${match.sim.toFixed(2)} rating=${match.ratings_average ?? "—"} (${match.ratings_count} reviews)`,
  );

  return {
    rating_avg:   match.ratings_average ?? 0,
    rating_count: match.ratings_count,
    vintage_id:   match.vivino_vintage_id,
  };
}
