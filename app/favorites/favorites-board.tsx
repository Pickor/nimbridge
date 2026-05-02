"use client";

import { useEffect, useRef, useState } from "react";
import type { ClassifiedListing } from "@/lib/types";
import ListingRow from "@/components/listing-row";

const RATE_LIMIT_MS = 60_000;   // 1 minute between clicks
const POLL_INTERVAL = 5_000;    // check workflow status every 5 s
const POLL_TIMEOUT  = 150_000;  // give up after 2.5 min
const LS_KEY        = "fav_last_refresh";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("sv-SE", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

interface Props {
  initialListings: ClassifiedListing[];
  initialFavoriteIds: string[];
  currency: string;
  showShipping: boolean;
}

export default function FavoritesBoard({
  initialListings,
  initialFavoriteIds,
  currency,
  showShipping,
}: Props) {
  const [listings, setListings]       = useState(initialListings);
  const [favoriteIds, setFavoriteIds] = useState(new Set(initialFavoriteIds));
  const [showTopBtn, setShowTopBtn]   = useState(false);

  // ── Refresh state ─────────────────────────────────────────────────────────
  type RefreshStatus = "idle" | "loading" | "waiting" | "done" | "error";
  const [status, setStatus]             = useState<RefreshStatus>("idle");
  const [lastUpdated, setLastUpdated]   = useState<number | null>(null);
  const [rateLimitMsg, setRateLimitMsg] = useState(false);

  const rateLimitTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pollTimer       = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pollDeadline    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dispatchTime    = useRef<number>(0);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) setLastUpdated(Number(stored));
  }, []);

  useEffect(() => {
    const onScroll = () => setShowTopBtn(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Clean up polling on unmount
  useEffect(() => () => {
    clearInterval(pollTimer.current);
    clearTimeout(pollDeadline.current);
  }, []);

  function stopPolling() {
    clearInterval(pollTimer.current);
    clearTimeout(pollDeadline.current);
  }

  /** Fetch fresh listings from the server and apply them. */
  async function applyFreshListings(): Promise<void> {
    try {
      const res = await fetch("/api/favorites/refresh");
      if (!res.ok) return;
      const json = await res.json();
      if (!Array.isArray(json.listings)) return;

      const fresh = json.listings as ClassifiedListing[];
      setListings(fresh);
      setFavoriteIds(new Set(fresh.map((l) => l.id)));
      const ts = Date.now();
      localStorage.setItem(LS_KEY, String(ts));
      setLastUpdated(ts);
    } catch {
      // ignore transient errors
    }
  }

  /** Poll GitHub Actions until the workflow completes, then refresh data. */
  async function pollWorkflowStatus() {
    try {
      const res = await fetch(`/api/favorites/workflow-status?since=${dispatchTime.current}`);
      if (!res.ok) return;
      const json = await res.json() as { status: string; conclusion?: string | null };

      if (json.status === "completed") {
        stopPolling();
        await applyFreshListings();
        setStatus("done");
        setTimeout(() => setStatus("idle"), 4000);
      }
      // "queued" or "in_progress" → keep polling
    } catch {
      // ignore transient errors
    }
  }

  const handleToggle = (id: string, isFav: boolean) => {
    if (!isFav) setListings((prev) => prev.filter((l) => l.id !== id));
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.add(id); else next.delete(id);
      return next;
    });
  };

  async function handleRefresh() {
    const now = Date.now();
    if (lastUpdated && now - lastUpdated < RATE_LIMIT_MS) {
      setRateLimitMsg(true);
      clearTimeout(rateLimitTimer.current);
      rateLimitTimer.current = setTimeout(() => setRateLimitMsg(false), 3000);
      return;
    }

    setStatus("loading");
    setRateLimitMsg(false);
    stopPolling();

    try {
      const res = await fetch("/api/favorites/refresh", { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "unknown");

      // Record when we dispatched so we can match the correct workflow run
      dispatchTime.current = Date.now();

      // Workflow queued — poll GitHub Actions status every 5s
      setStatus("waiting");
      pollTimer.current = setInterval(pollWorkflowStatus, POLL_INTERVAL);

      // Safety net: force-refresh after 2.5 min regardless
      pollDeadline.current = setTimeout(async () => {
        stopPolling();
        await applyFreshListings();
        setStatus("done");
        setTimeout(() => setStatus("idle"), 4000);
      }, POLL_TIMEOUT);

    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 8000);
    }
  }

  if (listings.length === 0) {
    return (
      <div className="flex items-center justify-center h-16 rounded-xl border border-neutral-800 text-neutral-500 text-sm">
        No favorites yet — heart a lot on the Deals page to save it here.
      </div>
    );
  }

  return (
    <>
      {showTopBtn && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-1.5 px-3 py-2 rounded-full bg-neutral-800 border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors shadow-lg"
        >
          ↑ Top
        </button>
      )}

      {/* ── Update bar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={handleRefresh}
          disabled={status === "loading" || status === "waiting"}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "loading" || status === "waiting" ? (
            <>
              <svg className="w-4 h-4 animate-spin text-neutral-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
              {status === "waiting" ? "Fetching latest bids…" : "Starting…"}
            </>
          ) : (
            <>
              <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Update favorite listings
            </>
          )}
        </button>

        {rateLimitMsg && (
          <span className="text-xs text-red-400 font-medium">Max 1 click per minute</span>
        )}
        {status === "waiting" && !rateLimitMsg && (
          <span className="text-xs text-neutral-500">Updating, please wait (~30–60s)…</span>
        )}
        {status === "done" && !rateLimitMsg && (
          <span className="text-xs text-emerald-400 font-medium">Updated!</span>
        )}
        {status === "error" && !rateLimitMsg && (
          <span className="text-xs text-red-400 font-medium">Update failed — try again</span>
        )}

        {lastUpdated && (
          <span className="text-xs text-neutral-500 ml-auto">
            Last updated: {formatTime(lastUpdated)}
          </span>
        )}
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl border border-neutral-800 [overflow:clip]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-neutral-800 bg-neutral-900">
                <th className="py-2 pl-2 pr-2 w-10" />
                <th className="py-2 pr-3 text-xs font-medium text-neutral-400">Lot</th>
                <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Bid</th>
                <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">+9%</th>
                <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">{currency} (incl 9%)</th>
                {showShipping && (
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Ship SE</th>
                )}
                {showShipping && (
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Total {currency}</th>
                )}
                <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Last price</th>
                <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Rating</th>
                {currency === "SEK" && (
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">SB pris</th>
                )}
                <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Estimate</th>
                <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">vs Est</th>
                <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Time left</th>
                <th className="py-2 pr-2 w-8 sticky right-0 bg-neutral-900" />
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <ListingRow
                  key={listing.id}
                  listing={listing}
                  isFavorite={favoriteIds.has(listing.id)}
                  onToggleFavorite={handleToggle}
                  currency={currency}
                  showShipping={showShipping}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-1.5 text-[10px] text-neutral-600 border-t border-neutral-800">
          +9% buyer&apos;s premium{showShipping ? " · Ship SE = shipping to Sweden · Total incl. shipping" : ""}
        </div>
      </div>
    </>
  );
}
