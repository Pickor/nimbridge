/**
 * Detect Catawiki's "no reserve" tag in a lot title.
 *
 * Two title shapes in the wild — the regex matches both:
 *   - Jewellery prefix:    "No reserve price - Necklace, 18 kt yellow gold…"
 *   - Wine mid-string tag: "Rémy Martin - No Reserve Price - Louis XIII…"
 *
 * Word-boundary `\bno\s*reserve\b` avoids false positives on phrases like
 * "Founder's Reserve" or "Gold Reserve" (no preceding "no").
 *
 * Used both as a filter (listings-board, history-board) and to render
 * a visible "🟢 No reserve" badge on the row itself.
 */
export function isNoReserve(title: string): boolean {
  return /\bno\s*reserve(\s*price)?\b/i.test(title);
}
