/**
 * Build external search URLs for wine rating sources.
 *
 * Both Vivino and CellarTracker accept a free-text search query; we don't
 * have stable wine IDs in the listings table for either, so we just feed
 * the lot title (lightly cleaned) into their search.
 *
 * Used by listing-row.tsx and history-row.tsx to make the rating cells
 * clickable.
 */

/** Strip Catawiki-specific suffix junk from a lot title to improve search hits. */
function cleanForSearch(title: string): string {
  return title
    // " - 1 Bottle", " - 3 Bottles", etc.
    .replace(/\s*[-–]\s*\d+\s*Bottles?.*$/i, "")
    // " - 70cl", " - 0.75L", " - 1.5 Litres", " - 5cl", etc.
    .replace(/\s*[-–]\s*\d+(?:[.,]\d+)?\s*(?:cl|ml|l|litres?|liter)\b.*$/i, "")
    // Parenthetical volume "(0.75L)" anywhere
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function vivinoSearchUrl(title: string): string {
  return `https://www.vivino.com/search/wines?q=${encodeURIComponent(cleanForSearch(title))}`;
}

export function cellartrackerSearchUrl(title: string): string {
  return `https://www.cellartracker.com/list.asp?szSearch=${encodeURIComponent(cleanForSearch(title))}`;
}

/**
 * Aggressive cleanup for Systembolaget's search, which is a strict
 * brand/name match and chokes on volume units (ml/cl/l), bottle counts,
 * and stray digits. We strip them all so e.g. "Yamazaki 18 years old - 70cl"
 * becomes just "Yamazaki".
 */
function cleanForSystembolaget(title: string): string {
  return title
    .split(",")[0]
    // Remove volumes with their units BEFORE we kill digits — covers
    // "70cl", "0.75L", "1.5 Litres", "5 ml", etc.
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|litres?|liter)\b/gi, "")
    // Remove bare "ml/cl/l/litre/liter" tokens that survived earlier processing
    .replace(/\b(?:ml|cl|l|litres?|liter)\b/gi, "")
    .replace(/ - /g, " ")
    .replace(/\d+/g, "")
    .replace(/\byears?\s*old\b/gi, "")
    .replace(/[^a-zA-ZÀ-ÿ\s]/g, "")
    .replace(/\b[a-zA-ZÀ-ÿ]\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function systembolagetSearchUrl(title: string): string {
  return `https://www.systembolaget.se/sortiment/?q=${encodeURIComponent(cleanForSystembolaget(title))}`;
}
