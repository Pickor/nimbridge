/**
 * Paginated row fetcher for Supabase / PostgREST.
 *
 * PostgREST honors `.limit()` only up to `db-max-rows` (1000 by default
 * on Supabase). Asking for `.limit(5000)` therefore silently caps at
 * 1000, which truncates the dashboard. This helper loops `.range()`
 * calls until the source is exhausted (or `maxRows` is reached, as a
 * safety guard).
 *
 * Usage:
 *   const rows = await fetchAllRows<HistoryListing>((from, to) =>
 *     supabase.from("auction_results").select("*").eq("category", "wine-whisky-spirits").order("ends_at", { ascending: false }).range(from, to),
 *   );
 */
type RangeQuery<T> = (
  from: number,
  to: number,
) => PromiseLike<{ data: T[] | null; error: unknown }>;

export async function fetchAllRows<T>(
  buildQuery: RangeQuery<T>,
  pageSize = 1000,
  maxRows = 50_000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await buildQuery(from, to);
    if (error) {
      console.error("[fetchAllRows] error:", error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}
