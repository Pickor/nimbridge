/**
 * Small "X minutes ago — last scrape ran for Y" banner shown on the
 * dashboard. Reads the latest row from `scraper_runs` so users can
 * tell whether the data they're seeing is fresh.
 */
function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

interface StatusBarProps {
  activeListings: number;
  lastRunAt: string | null;
  lastRunScraped: number | null;
}

export default function StatusBar({
  activeListings,
  lastRunAt,
  lastRunScraped,
}: StatusBarProps) {
  return (
    <div className="border-b border-neutral-800 bg-neutral-900/50 px-6 py-2">
      <div className="mx-auto max-w-7xl flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
        <span>
          <span className="text-white font-medium">{activeListings}</span>{" "}
          active listings
        </span>
        <span className="text-neutral-700">·</span>
        <span>
          Scraper{" "}
          {lastRunAt ? (
            <>
              last ran{" "}
              <span className="text-white font-medium">
                {fmtRelative(lastRunAt)}
              </span>
              {lastRunScraped !== null && (
                <span className="text-neutral-500">
                  {" "}({lastRunScraped} lots)
                </span>
              )}
            </>
          ) : (
            <span className="text-neutral-600">never ran</span>
          )}
        </span>
      </div>
    </div>
  );
}
