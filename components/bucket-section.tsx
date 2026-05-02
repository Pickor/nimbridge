/**
 * Dashboard "bucket" section — one of these per price-classification
 * group ("Low price", "Good price", "Ending soon — no bids", etc.).
 *
 * Renders a heading with a count badge and a table of ListingRows.
 * The dashboard composes 5–6 BucketSections, each with the listings
 * the v_classified_listings view assigned to that bucket.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import type { ClassifiedListing } from "@/lib/types";
import ListingRow from "./listing-row";

interface Props {
  title: string;
  listings: ClassifiedListing[];
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string, isFav: boolean) => void;
  accent: "red" | "green" | "neutral";
  emptyMessage: string;
  currency: string;
  showShipping: boolean;
  /**
   * Vertical the lots in this bucket belong to. Determines which columns
   * appear in the table (jewellery hides Rating + SB pris, shows Value).
   */
  vertical?: "wine-whisky-spirits" | "jewellery" | "watches" | "apple";
}

const accentClass = {
  red:     "text-orange-400",
  green:   "text-emerald-400",
  neutral: "text-blue-400",
} as const;

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 3;

// Page size for per-bucket "Load more" pagination. With 1 000+ lots in a
// single bucket, rendering them all at once balloons DOM size and slows
// scrolling — chunk into pages of 100 and let the user expand on demand.
const PAGE_SIZE = 100;

/**
 * Two-finger pinch on a touch device scales just the table this hook is
 * attached to. Mouse / trackpad users are unaffected — touchstart never fires.
 * The `zoom` value is applied via CSS `zoom`, which all current major browsers
 * support; older browsers render at 100% (graceful fallback).
 */
function useTablePinchZoom() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  // Refs so the touch handlers don't need to re-bind when zoom changes.
  const zoomRef = useRef(1);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let startDistance = 0;
    let startZoom = 1;
    let pinching = false;

    const distance = (touches: TouchList) => {
      const a = touches[0];
      const b = touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      startDistance = distance(e.touches);
      startZoom = zoomRef.current;
      pinching = true;
      e.preventDefault(); // suppress browser-level page pinch on this region
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinching || e.touches.length !== 2 || startDistance === 0) return;
      const ratio = distance(e.touches) / startDistance;
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, startZoom * ratio));
      setZoom(next);
      e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinching = false;
        startDistance = 0;
      }
    };

    // touchstart/touchmove must be non-passive so preventDefault() can stop
    // the browser from doing its own page pinch.
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return { containerRef, zoom };
}

export default function BucketSection({
  title,
  listings,
  favoriteIds,
  onToggleFavorite,
  accent,
  emptyMessage,
  currency,
  showShipping,
  vertical = "wine-whisky-spirits",
}: Props) {
  const { containerRef, zoom } = useTablePinchZoom();
  const isWine = vertical === "wine-whisky-spirits";
  const isJewellery = vertical === "jewellery";

  // Per-bucket pagination — reset to page 1 whenever the listings array
  // identity changes (filters, sort, refresh). Tier with ≤ PAGE_SIZE
  // lots renders all rows and hides the Load more button entirely.
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [listings]);
  const visibleCount = Math.min(page * PAGE_SIZE, listings.length);
  const visible = listings.slice(0, visibleCount);
  const hasMore = visibleCount < listings.length;
  const remaining = listings.length - visibleCount;

  return (
    <details open className="group">
      <summary
        className={`text-base font-semibold mb-2 flex items-center gap-2 cursor-pointer list-none select-none ${accentClass[accent]}`}
      >
        <span
          aria-hidden
          className="flex items-center justify-center w-6 h-6 rounded-full border border-neutral-700 bg-neutral-800 text-neutral-200 text-sm leading-none group-hover:bg-neutral-700 group-hover:border-neutral-600 group-open:rotate-180 transition-all shrink-0"
        >▾</span>
        {title}
        <span className="px-1.5 py-0.5 rounded-md bg-neutral-800 text-neutral-300 text-xs font-medium tabular-nums">
          {listings.length}
        </span>
      </summary>

      {listings.length === 0 ? (
        <div className="flex items-center justify-center h-16 rounded-xl border border-neutral-800 text-neutral-500 text-sm">
          {emptyMessage}
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 [overflow:clip]">
          <div
            ref={containerRef}
            // touch-action: pinch-zoom signals to the browser that this region
            // handles its own pinch; combined with preventDefault() in the
            // touch handlers, that scopes pinch to the table only.
            style={{ zoom, touchAction: "pinch-zoom pan-x pan-y" }}
            className="overflow-x-auto"
          >
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
                  {isWine && (
                    <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Rating</th>
                  )}
                  {isWine && currency === "SEK" && (
                    <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">SB pris</th>
                  )}
                  {isJewellery && (
                    <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Grade</th>
                  )}
                  {isJewellery && (
                    <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Weight</th>
                  )}
                  {isJewellery && (
                    <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Value</th>
                  )}
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Estimate</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">vs Est</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Time left</th>
                  <th className="py-2 pr-2 w-8 sticky right-0 bg-neutral-900" />
                </tr>
              </thead>
              <tbody>
                {visible.map((listing) => (
                  <ListingRow
                    key={listing.id}
                    listing={listing}
                    isFavorite={favoriteIds.has(listing.id)}
                    onToggleFavorite={onToggleFavorite}
                    currency={currency}
                    showShipping={showShipping}
                    vertical={vertical}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-bucket pagination — show a Load more button when more
              rows are available, plus a "Show all" shortcut and an
              "X of Y" counter. Tiny tiers (≤ PAGE_SIZE) render directly
              and skip this footer entirely. */}
          {(hasMore || page > 1) && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-neutral-800 bg-neutral-900/40">
              <span className="text-[11px] text-neutral-500 tabular-nums">
                Showing {visibleCount.toLocaleString("sv-SE")} of {listings.length.toLocaleString("sv-SE")}
              </span>
              {hasMore && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
                  >
                    Load more ({remaining.toLocaleString("sv-SE")} remaining)
                  </button>
                  <button
                    onClick={() => setPage(Math.ceil(listings.length / PAGE_SIZE))}
                    className="px-3 py-1 rounded-full bg-neutral-800/60 border border-neutral-800 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
                    title="Render every row in this tier"
                  >
                    Show all
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="px-3 py-1.5 text-[10px] text-neutral-600 border-t border-neutral-800">
            +9% buyer&apos;s premium{showShipping ? " · Ship SE = shipping to Sweden · Total incl. shipping" : ""}
          </div>
        </div>
      )}
    </details>
  );
}
