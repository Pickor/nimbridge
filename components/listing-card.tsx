/**
 * Card-style alternative to ListingRow — used for compact / mobile
 * layouts where a wide table doesn't fit. Same data, different shape.
 *
 * Currently not wired into any page; kept as a building block for
 * a future mobile dashboard variant.
 */
"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import type { ClassifiedListing } from "@/lib/types";
import FavoriteButton from "./favorite-button";
import Countdown from "./countdown";

interface Props {
  listing: ClassifiedListing;
  isFavorite: boolean;
  onToggleFavorite: (id: string, isFav: boolean) => void;
  index: number;
}

function formatMoney(amount: number | null, currency: string): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatEndDate(endsAt: string): string {
  const d = new Date(endsAt);
  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "short" });
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${day} ${month}, ${hh}:${mm}`;
}

export default function ListingCard({
  listing,
  isFavorite,
  onToggleFavorite,
  index,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.4) }}
      whileHover={{ scale: 1.02 }}
      className="shrink-0 w-44 sm:w-60 snap-start rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden flex flex-col"
    >
      {/* Image */}
      <div className="relative h-40 bg-neutral-800">
        {listing.image_url ? (
          <Image
            src={listing.image_url}
            alt={listing.title}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-neutral-600">
            🍷
          </div>
        )}
        <div className="absolute top-2 right-2">
          <FavoriteButton
            listingId={listing.id}
            isFavorite={isFavorite}
            onToggle={onToggleFavorite}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 p-3 flex-1">
        <p className="text-sm font-medium text-white line-clamp-2 leading-snug min-h-[2.5rem]">
          {listing.title}
        </p>

        <div className="mt-auto space-y-1 text-xs">
          <div className="flex items-baseline justify-between">
            <span className="text-neutral-500">Current bid</span>
            <span className="font-bold text-white text-sm">
              {formatMoney(listing.current_bid, listing.currency)}
            </span>
          </div>
          {listing.estimated_low !== null && (
            <div className="flex items-baseline justify-between">
              <span className="text-neutral-500">Estimate</span>
              <span className="text-neutral-400">
                {formatMoney(listing.estimated_low, listing.currency)}–
                {formatMoney(listing.estimated_high, listing.currency)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">
              {listing.bid_count} bid{listing.bid_count !== 1 ? "s" : ""}
            </span>
            <Countdown endsAt={listing.ends_at} />
          </div>
          <div className="text-xs text-neutral-600">
            Ends {formatEndDate(listing.ends_at)}
          </div>
        </div>

        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block w-full rounded-lg bg-neutral-800 hover:bg-neutral-700 text-center text-xs text-neutral-300 py-2 transition-colors"
        >
          View on Catawiki ↗
        </a>
      </div>
    </motion.div>
  );
}
