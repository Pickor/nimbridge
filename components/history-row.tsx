/**
 * Single CLOSED-auction row, rendered in the table on /history.
 *
 * Sister component to listing-row.tsx (which is for active auctions).
 * The two duplicate ~75% of their code; consolidating them into a
 * shared row component is a candidate refactor (Phase 3 in the
 * cleanup plan).
 *
 * Shows final price, buyer's premium, currency conversion, ship cost
 * to Sweden when applicable, vs-estimate %, sale outcome (sold / not
 * sold / RPNR), Vivino + CT scores, and Systembolaget retail price.
 */
"use client";

import Image from "next/image";
import type { HistoryListing } from "@/lib/types";
import { fAmount } from "@/lib/currency";
import { vivinoSearchUrl, cellartrackerSearchUrl, systembolagetSearchUrl } from "@/lib/wine-links";
import { estimateJewelleryValueEur } from "@/lib/jewellery-value";

// Catawiki adds a 9% buyer's premium to the winning bid.
const PREMIUM = 1.09;

function fEur(n: number | null): string {
  if (n === null) return "—";
  return "€ " + Math.round(n).toLocaleString("sv-SE");
}

function fSek(n: number | null): string {
  if (n === null) return "—";
  return Math.round(n).toLocaleString("sv-SE") + " kr";
}

function pctVsEst(final: number, low: number | null, high: number | null) {
  if (!low || !high) return null;
  const mid = (low + high) / 2;
  const pct = ((final - mid) / mid) * 100;
  const text = (pct >= 0 ? "+" : "") + Math.round(pct) + "%";
  const cls =
    pct <= -30 ? "text-emerald-400" :
    pct <= -10 ? "text-blue-400"    :
    pct <= 15  ? "text-neutral-400" : "text-red-400";
  return { text, cls };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface Props {
  listing: HistoryListing;
  currency: string;
  showShipping: boolean;
  /** Vertical the row belongs to. Hides Rating + SB pris on non-wine. */
  vertical?: "wine-whisky-spirits" | "jewellery" | "watches" | "apple";
}

export default function HistoryRow({ listing, currency, showShipping, vertical = "wine-whisky-spirits" }: Props) {
  const isWine = vertical === "wine-whisky-spirits";
  const isJewellery = vertical === "jewellery";
  const final       = listing.final_price;
  const withPremium = final * PREMIUM;
  const shipping    = listing.shipping_cost_eur ?? null;

  // Material/stone valuation in EUR — jewellery only. auction_results
  // doesn't carry the `specifications` JSONB column, so we feed the
  // archive's stored `weight_g` straight in (gold/silver need it; diamonds
  // get carat from the title regardless).
  const valueEur = isJewellery
    ? estimateJewelleryValueEur(
        listing.title,
        listing.catawiki_category_id,
        listing.catawiki_subcategory_id,
        null,
        listing.weight_g,
      )
    : null;

  const estText =
    listing.estimated_low !== null && listing.estimated_high !== null
      ? `${fEur(listing.estimated_low)}–${fEur(listing.estimated_high)}`
      : "—";
  const pct = pctVsEst(final, listing.estimated_low, listing.estimated_high);

  return (
    <tr className="group border-b border-neutral-800 even:bg-white/[0.025] hover:bg-neutral-800/60 transition-colors">

      {/* Thumbnail */}
      <td className="py-2 pl-2 pr-2 w-10">
        <div className="relative w-10 h-10 rounded overflow-hidden bg-neutral-800 shrink-0">
          {listing.image_url ? (
            <Image src={listing.image_url} alt="" fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full items-center justify-center text-lg text-neutral-600">🍷</div>
          )}
        </div>
      </td>

      {/* Title + end date */}
      <td className="py-2 pr-4 min-w-[160px]">
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs sm:text-sm text-white hover:text-blue-400 line-clamp-3 transition-colors leading-snug"
        >
          {listing.title}
        </a>
        <div className="text-[10px] text-neutral-500 mt-0.5 tabular-nums">
          Ended {formatDate(listing.ends_at)}
        </div>
      </td>

      {/* Final price EUR */}
      <td className="py-2 pr-3 text-right align-top">
        <div className="text-xs sm:text-sm font-medium text-white tabular-nums whitespace-nowrap">
          {fEur(final)}
        </div>
      </td>

      {/* +9% EUR */}
      <td className="py-2 pr-3 text-right align-top">
        <div className="text-xs sm:text-sm text-neutral-300 tabular-nums whitespace-nowrap">
          {fEur(withPremium)}
        </div>
        <div className="text-[10px] text-neutral-600">+9%</div>
      </td>

      {/* Currency (incl 9%) */}
      <td className="py-2 pr-3 text-right align-top min-w-[88px]">
        <div className="text-xs sm:text-sm text-yellow-400 tabular-nums whitespace-nowrap">
          {fAmount(withPremium, currency)}
        </div>
        <div className="text-[10px] text-neutral-600">incl 9%</div>
      </td>

      {/* Shipping — hidden for non-SE */}
      {showShipping && (
        <td className="py-2 pr-3 text-right align-top min-w-[72px]">
          {shipping === null ? (
            <span className="text-neutral-600 text-xs">—</span>
          ) : shipping === 0 ? (
            <span className="text-emerald-400 text-xs font-medium">Free</span>
          ) : (
            <div className="text-xs text-neutral-300 tabular-nums whitespace-nowrap">
              {fEur(shipping)}
            </div>
          )}
        </td>
      )}

      {/* Total in user currency — hidden for non-SE */}
      {showShipping && (
        <td className="py-2 pr-3 text-right align-top min-w-[80px]">
          {shipping !== null ? (
            <div className="text-xs sm:text-sm text-orange-300 tabular-nums whitespace-nowrap font-medium">
              {fAmount(withPremium + shipping, currency)}
            </div>
          ) : (
            <span className="text-neutral-600 text-xs">—</span>
          )}
        </td>
      )}

      {/* Estimated material / stone value — jewellery only. */}
      {isJewellery && (
        <td className="py-2 pr-3 text-right align-top whitespace-nowrap">
          {valueEur != null ? (
            <div
              className="text-xs font-medium text-cyan-400 tabular-nums"
              title="Rough material / stone value from title parsing — sanity check, not an appraisal"
            >
              {fAmount(valueEur, currency)}
            </div>
          ) : (
            <span className="text-neutral-700 text-xs">—</span>
          )}
        </td>
      )}

      {/* Estimate */}
      <td className="py-2 pr-3 text-right align-top">
        <div className="text-xs text-neutral-500 tabular-nums whitespace-nowrap">{estText}</div>
      </td>

      {/* vs Estimate */}
      <td className="py-2 pr-3 text-right align-top">
        {pct ? (
          <span className={`text-xs tabular-nums font-medium ${pct.cls}`}>{pct.text}</span>
        ) : (
          <span className="text-neutral-600 text-xs">—</span>
        )}
      </td>

      {/* Bids */}
      <td className="py-2 pr-3 text-right align-top">
        <span className="text-xs tabular-nums text-neutral-300">
          {listing.bid_count > 0 ? listing.bid_count : "—"}
        </span>
      </td>

      {/* Unique bidders */}
      <td className="py-2 pr-3 text-right align-top">
        <span className="text-xs tabular-nums text-neutral-300">
          {listing.unique_bidders != null && listing.unique_bidders > 0 ? listing.unique_bidders : "—"}
        </span>
      </td>

      {/* Outcome */}
      <td className="py-2 pr-3 text-right align-top">
        {listing.lot_outcome === "sold" ? (
          <span className="text-xs font-semibold text-emerald-400" title="Sold">S</span>
        ) : listing.lot_outcome === "not_sold" ? (
          <span className="text-xs font-semibold text-red-400" title="Not Sold">NS</span>
        ) : listing.lot_outcome === "no_bids" ? (
          <span className="text-xs font-semibold text-neutral-400" title="Reservation Price Not Reached">RPNR</span>
        ) : (
          <span className="text-neutral-600 text-xs">—</span>
        )}
      </td>

      {/* Vivino + CellarTracker — wine only */}
      {isWine && (
        <td className="py-2 pr-3 text-right align-top whitespace-nowrap">
          {listing.vivino_rating_avg != null || listing.cellartracker_score != null ? (
            <div className="flex flex-col items-end gap-0.5">
              {listing.vivino_rating_avg != null && (
                <a
                  href={vivinoSearchUrl(listing.title)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Search this wine on Vivino"
                  className="text-xs font-medium text-amber-400 hover:text-amber-300 tabular-nums transition-colors"
                >
                  {listing.vivino_rating_avg.toFixed(1)} ★ <span className="text-[9px] text-neutral-500">VV</span>
                </a>
              )}
              {listing.cellartracker_score != null && (
                <a
                  href={cellartrackerSearchUrl(listing.title)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Search this wine on CellarTracker"
                  className="text-xs font-medium text-violet-400 hover:text-violet-300 tabular-nums transition-colors"
                >
                  {listing.cellartracker_score.toFixed(1)} <span className="text-[9px] text-neutral-500">CT</span>
                </a>
              )}
            </div>
          ) : (
            <span className="text-neutral-700 text-xs">—</span>
          )}
        </td>
      )}

      {/* Systembolaget retail price — wine + SEK only */}
      {isWine && currency === "SEK" && (
        <td className="py-2 pr-3 text-right align-top whitespace-nowrap">
          {listing.sb_price != null ? (
            <a
              href={systembolagetSearchUrl(listing.title)}
              target="_blank"
              rel="noopener noreferrer"
              title="Systembolaget retail price — click to search"
              className="text-xs font-medium text-blue-400 hover:text-blue-300 tabular-nums transition-colors"
            >
              {fSek(listing.sb_price)}
            </a>
          ) : (
            <span className="text-neutral-700 text-xs">—</span>
          )}
        </td>
      )}

    </tr>
  );
}
