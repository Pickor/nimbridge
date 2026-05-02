/**
 * Star-toggle for favoriting a lot. Optimistic UI — the heart flips
 * instantly on click, then we POST/DELETE to /api/favorites in the
 * background. If the API call fails, we revert the heart.
 */
"use client";

import { useState } from "react";

interface Props {
  listingId: string;
  isFavorite: boolean;
  onToggle: (id: string, isFav: boolean) => void;
  compact?: boolean;
}

export default function FavoriteButton({
  listingId,
  isFavorite,
  onToggle,
  compact = false,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/favorites", {
        method: isFavorite ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: listingId }),
      });
      if (res.ok) onToggle(listingId, !isFavorite);
    } finally {
      setLoading(false);
    }
  }

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        className="text-base leading-none opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
      >
        {isFavorite ? "❤️" : "🤍"}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      className="flex items-center justify-center w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors disabled:opacity-50"
    >
      <span className="text-base leading-none">
        {isFavorite ? "❤️" : "🤍"}
      </span>
    </button>
  );
}
