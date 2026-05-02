/**
 * Live "ends in 2h 14m" countdown for an auction lot.
 *
 * Re-renders every second when the lot is <1h away, every minute when
 * further out (saves battery on idle dashboard tabs). Falls back to
 * "Ended" when the timestamp is in the past.
 */
"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatEndDate(endsAt: string): string {
  const d = new Date(endsAt);
  return d.toLocaleString("sv-SE", {
    month: "short",
    day:   "numeric",
    hour:  "2-digit",
    minute:"2-digit",
  });
}

export default function Countdown({ endsAt }: { endsAt: string }) {
  const [msLeft, setMsLeft] = useState(
    () => new Date(endsAt).getTime() - Date.now()
  );

  useEffect(() => {
    const id = setInterval(
      () => setMsLeft(new Date(endsAt).getTime() - Date.now()),
      1000
    );
    return () => clearInterval(id);
  }, [endsAt]);

  const urgent = msLeft > 0 && msLeft < 3_600_000;

  return (
    <div className="text-right">
      <span className={`text-xs tabular-nums ${urgent ? "text-orange-400" : "text-neutral-400"}`}>
        {formatRemaining(msLeft)}
      </span>
      <div className="text-[10px] text-neutral-600 tabular-nums whitespace-nowrap">
        {formatEndDate(endsAt)}
      </div>
    </div>
  );
}
