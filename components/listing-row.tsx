/**
 * Single ACTIVE-auction row. Used inside BucketSection on /dashboard
 * and in the table on /favorites.
 *
 * Renders all the per-lot info: title + image, current bid (with +9%
 * buyer's premium), shipping cost, currency conversion, Vivino + CT
 * scores, Systembolaget retail price (when in SEK), estimate ratio,
 * countdown, and the favorite-toggle.
 *
 * Mostly a presentational component — the ClassifiedListing already
 * carries all the data computed by the v_classified_listings view.
 */
"use client";

import Image from "next/image";
import type { ClassifiedListing } from "@/lib/types";
import FavoriteButton from "./favorite-button";
import Countdown from "./countdown";
import { fAmount } from "@/lib/currency";
import { vivinoSearchUrl, cellartrackerSearchUrl, systembolagetSearchUrl } from "@/lib/wine-links";

// Catawiki adds a 9% buyer's premium to every winning bid.
const PREMIUM = 1.09;

function fEur(n: number | null): string {
  if (n === null) return "—";
  return "€ " + Math.round(n).toLocaleString("sv-SE");
}

function fSek(n: number | null): string {
  if (n === null) return "—";
  return Math.round(n).toLocaleString("sv-SE") + " kr";
}

function pctVsEst(bid: number | null, low: number | null, high: number | null) {
  if (!bid || !low || !high || low + high === 0) return null;
  const mid = (low + high) / 2;
  const pct = ((bid - mid) / mid) * 100;
  const text = (pct >= 0 ? "+" : "") + Math.round(pct) + "%";
  const cls =
    pct <= -30 ? "text-emerald-400" :
    pct <= -10 ? "text-blue-400" :
    pct <= 15  ? "text-neutral-400" : "text-red-400";
  return { text, cls };
}

interface Props {
  listing: ClassifiedListing;
  isFavorite: boolean;
  onToggleFavorite: (id: string, isFav: boolean) => void;
  currency: string;
  showShipping: boolean;
}

export default function ListingRow({ listing, isFavorite, onToggleFavorite, currency, showShipping }: Props) {
  const bid = listing.current_bid;
  const withPremium = bid !== null ? bid * PREMIUM : null;
  const shipping = listing.shipping_cost_eur ?? null;
  const estText =
    listing.estimated_low !== null && listing.estimated_high !== null
      ? `${fEur(listing.estimated_low)}–${fEur(listing.estimated_high)}`
      : "—";
  const pct = pctVsEst(bid, listing.estimated_low, listing.estimated_high);

  return (
    <tr className="group border-b border-neutral-800 even:bg-white/[0.025] hover:bg-neutral-800/60 transition-colors">

      {/* Thumbnail */}
      <td className="py-2 pl-2 pr-2 w-10">
        <div className="relative w-8 h-8 rounded overflow-hidden bg-neutral-800 shrink-0">
          {listing.image_url ? (
            <Image src={listing.image_url} alt="" fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full items-center justify-center text-base text-neutral-600">🍷</div>
          )}
        </div>
      </td>

      {/* Title + bid count */}
      <td className="py-2 pr-3 min-w-[120px] max-w-[180px]">
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white hover:text-blue-400 line-clamp-3 transition-colors leading-snug"
        >
          {listing.title}
        </a>
        <div className="text-[10px] text-neutral-500 mt-0.5 tabular-nums">
          {listing.bid_count} bid{listing.bid_count !== 1 ? "s" : ""}
        </div>
      </td>

      {/* Current bid EUR */}
      <td className="py-2 pr-3 text-right align-top">
        <div className="text-xs font-medium text-white tabular-nums whitespace-nowrap">
          {fEur(bid)}
        </div>
      </td>

      {/* +9% total EUR */}
      <td className="py-2 pr-3 text-right align-top">
        <div className="text-xs text-neutral-300 tabular-nums whitespace-nowrap">
          {fEur(withPremium)}
        </div>
        <div className="text-[10px] text-neutral-600">+9%</div>
      </td>

      {/* Currency auction total (bid + 9%) */}
      <td className="py-2 pr-3 text-right align-top">
        <div className="text-xs text-yellow-400 tabular-nums whitespace-nowrap">
          {fAmount(withPremium, currency)}
        </div>
        <div className="text-[10px] text-neutral-600">incl 9%</div>
      </td>

      {/* Shipping to Sweden */}
      {showShipping && (
        <td className="py-2 pr-3 text-right align-top">
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

      {/* Total in user currency incl shipping */}
      {showShipping && (
        <td className="py-2 pr-3 text-right align-top">
          {withPremium !== null && shipping !== null ? (
            <div className="text-xs text-orange-300 tabular-nums whitespace-nowrap font-medium">
              {fAmount(withPremium + shipping, currency)}
            </div>
          ) : (
            <span className="text-neutral-600 text-xs">—</span>
          )}
        </td>
      )}

      {/* Last auction final price */}
      <td className="py-2 pr-3 text-right align-top whitespace-nowrap">
        {listing.last_auction_price != null ? (
          <div>
            <div className="text-xs text-purple-400 tabular-nums font-medium">
              {fEur(listing.last_auction_price)}
            </div>
            {listing.last_auction_ended_at && (
              <div className="text-[10px] text-neutral-600">
                {new Date(listing.last_auction_ended_at).toLocaleDateString("sv-SE", { month: "short", day: "numeric", year: "2-digit" })}
              </div>
            )}
          </div>
        ) : (
          <span className="text-neutral-700 text-xs">—</span>
        )}
      </td>

      {/* Vivino rating */}
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

      {/* Systembolaget retail price — only when displaying in SEK */}
      {currency === "SEK" && (
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

      {/* Estimate */}
      <td className="py-2 pr-3 text-right align-top">
        <div className="text-xs text-neutral-500 tabular-nums whitespace-nowrap">{estText}</div>
      </td>

      {/* vs estimate */}
      <td className="py-2 pr-3 text-right align-top">
        {pct ? (
          <span className={`text-xs tabular-nums font-medium ${pct.cls}`}>{pct.text}</span>
        ) : (
          <span className="text-neutral-600 text-xs">—</span>
        )}
      </td>

      {/* Time left */}
      <td className="py-2 pr-3 text-right align-top">
        <Countdown endsAt={listing.ends_at} />
      </td>

      {/* Favourite — sticky right */}
      <td className="py-2 pr-2 text-right align-middle sticky right-0 bg-neutral-950 group-even:bg-[#0d0d10] group-hover:bg-neutral-800/60 transition-colors z-10">
        <FavoriteButton
          listingId={listing.id}
          isFavorite={isFavorite}
          onToggle={onToggleFavorite}
          compact
        />
      </td>
    </tr>
  );
}
