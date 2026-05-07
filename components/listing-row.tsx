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
import {
  estimateJewelleryValueEur,
  extractWeightGrams,
  parseDiamondGrade,
  parseGoldKarat,
  parseSilverPurity,
} from "@/lib/jewellery-value";
import { isNoReserve } from "@/lib/no-reserve";

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
  /**
   * Vertical the lot belongs to. When omitted, falls back to the lot's
   * own listing.category — important on /favorites where mixed-vertical
   * rows share one table.
   */
  vertical?: "wine-whisky-spirits" | "jewellery" | "watches" | "apple";
  /**
   * "dashboard" (default) renders only the columns relevant to the
   * caller's vertical — clean, narrow tables. "favorites" renders every
   * extra column on every row so a wine + a diamond + a gold lot can
   * sit in one aligned table; cells fall back to "—" when not applicable.
   * SB pris column is hidden entirely in favorites mode.
   */
  mode?: "dashboard" | "favorites";
}

export default function ListingRow({
  listing, isFavorite, onToggleFavorite, currency, showShipping,
  vertical, mode = "dashboard",
}: Props) {
  const effectiveVertical: Props["vertical"] =
    vertical ?? (listing.category as Props["vertical"]) ?? "wine-whisky-spirits";
  const isWine = effectiveVertical === "wine-whisky-spirits";
  const isJewellery = effectiveVertical === "jewellery";

  // What cells to render. In favorites mode every extra column except
  // SB pris is always laid out so the table stays aligned across mixed
  // verticals; each cell's content still varies by the row's vertical.
  const isFav = mode === "favorites";
  const renderRating  = isFav || isWine;
  const renderSb      = !isFav && isWine && currency === "SEK";
  const renderValue   = isFav || isJewellery;
  const renderGrade   = isFav || isJewellery;
  const renderWeight  = isFav || isJewellery;
  const bid = listing.current_bid;
  const withPremium = bid !== null ? bid * PREMIUM : null;
  const shipping = listing.shipping_cost_eur ?? null;
  // Material/stone valuation for jewellery, in EUR. Null when title doesn't
  // match a known parser (e.g. coloured gem, complex piece without weight).
  const valueEur = isJewellery
    ? estimateJewelleryValueEur(
        listing.title,
        listing.catawiki_category_id,
        listing.catawiki_subcategory_id,
        listing.specifications,
      )
    : null;
  // Weight (in grams) for jewellery — pulled from the title or, as a
  // fallback, from any "Weight"-like row in Catawiki's specifications.
  const weightG = isJewellery
    ? extractWeightGrams(listing.title, listing.specifications)
    : null;
  // Per-row "Grade" content depends on the underlying material:
  //   diamond  -> shape · colour · clarity
  //   gold     -> "18 kt"
  //   silver   -> "925"
  //   anything else -> "—"
  const diamondGrade =
    isJewellery && listing.catawiki_category_id === 715
      ? parseDiamondGrade(listing.title)
      : null;
  const goldKarat =
    isJewellery && listing.catawiki_subcategory_id === 1660
      ? parseGoldKarat(listing.title)
      : null;
  const silverPurity =
    isJewellery && listing.catawiki_subcategory_id === 841
      ? parseSilverPurity(listing.title)
      : null;
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
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-neutral-500 tabular-nums">
            {listing.bid_count} bid{listing.bid_count !== 1 ? "s" : ""}
          </span>
          {isNoReserve(listing.title) && (
            <span
              className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-1.5 py-px leading-none whitespace-nowrap"
              title="Catawiki marks this lot as No reserve — no minimum price"
            >
              🟢 No reserve
            </span>
          )}
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

      {/* Vivino + CellarTracker ratings — wine only (always rendered in favorites) */}
      {renderRating && (
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

      {/* Systembolaget retail price — wine only, SEK only, and never on favorites */}
      {renderSb && (
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

      {/* Grade — jewellery only (always rendered in favorites). */}
      {renderGrade && (
        <td className="py-2 pr-3 text-right align-top whitespace-nowrap">
          {diamondGrade ? (
            <div className="text-xs text-neutral-300 tabular-nums" title="Shape · Colour · Clarity">
              <span className="capitalize">{diamondGrade.shape}</span>
              {" · "}
              <span className="text-amber-400 font-medium">{diamondGrade.color}</span>
              {" · "}
              <span className="text-cyan-300">{diamondGrade.clarity}</span>
            </div>
          ) : goldKarat ? (
            <div className="text-xs font-medium text-amber-400 tabular-nums" title="Gold karat parsed from title">
              {goldKarat} kt
            </div>
          ) : silverPurity ? (
            <div className="text-xs font-medium text-neutral-300 tabular-nums" title="Silver purity parsed from title">
              {silverPurity}
            </div>
          ) : (
            <span className="text-neutral-700 text-xs">—</span>
          )}
        </td>
      )}

      {/* Weight — jewellery only (always rendered in favorites). */}
      {renderWeight && (
        <td className="py-2 pr-3 text-right align-top whitespace-nowrap">
          {weightG != null ? (
            <div className="text-xs text-neutral-300 tabular-nums" title="Weight parsed from title or specifications">
              {weightG.toLocaleString("sv-SE")} g
            </div>
          ) : (
            <span className="text-neutral-700 text-xs">—</span>
          )}
        </td>
      )}

      {/* Estimated material / stone value — jewellery only (always rendered in favorites). */}
      {renderValue && (
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
