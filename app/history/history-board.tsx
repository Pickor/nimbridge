"use client";

import { useEffect, useMemo, useState } from "react";
import type { HistoryListing, LotOutcome } from "@/lib/types";
import HistoryRow from "@/components/history-row";

// ── Category config ────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: null,  label: "All",           icon: "🌐" },
  { id: 437,   label: "Whisky",        icon: "🥃" },
  { id: 965,   label: "Rum & Cognac",  icon: "🥃" },
  { id: 443,   label: "Wine",          icon: "🍷" },
  { id: 961,   label: "Champagne",     icon: "🥂" },
  { id: 971,   label: "Port & Sweet",  icon: "🍷" },
  { id: 963,   label: "Beer",          icon: "🍺" },
] as const;

// ── Sort config ────────────────────────────────────────────────────────────

type SortMode = "date_desc" | "date_asc" | "price_desc" | "price_asc" | "vs_est_asc" | "vs_est_desc";

function vsEstPct(l: HistoryListing): number {
  const { final_price: f, estimated_low: low, estimated_high: high } = l;
  if (!low || !high) return Infinity;
  const mid = (low + high) / 2;
  return ((f - mid) / mid) * 100;
}

function sortHistory(list: HistoryListing[], mode: SortMode): HistoryListing[] {
  switch (mode) {
    case "date_desc":   return [...list].sort((a, b) => b.ends_at.localeCompare(a.ends_at));
    case "date_asc":    return [...list].sort((a, b) => a.ends_at.localeCompare(b.ends_at));
    case "price_desc":  return [...list].sort((a, b) => b.final_price - a.final_price);
    case "price_asc":   return [...list].sort((a, b) => a.final_price - b.final_price);
    case "vs_est_asc":  return [...list].sort((a, b) => {
      const pa = vsEstPct(a), pb = vsEstPct(b);
      if (!isFinite(pa) && !isFinite(pb)) return 0;
      if (!isFinite(pa)) return 1;
      if (!isFinite(pb)) return -1;
      return pa - pb;
    });
    case "vs_est_desc": return [...list].sort((a, b) => {
      const pa = vsEstPct(a), pb = vsEstPct(b);
      if (!isFinite(pa) && !isFinite(pb)) return 0;
      if (!isFinite(pa)) return 1;
      if (!isFinite(pb)) return -1;
      return pb - pa;
    });
  }
}

// ── Pill ───────────────────────────────────────────────────────────────────

function Pill({
  active, onClick, children, title,
}: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2.5 py-1 rounded-full text-xs transition-colors border shrink-0 ${
        active
          ? "bg-white text-black border-white font-medium"
          : "bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500 hover:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

const OUTCOMES: { value: LotOutcome | "all"; label: string; color: string }[] = [
  { value: "all",      label: "All",  color: "" },
  { value: "sold",     label: "S — Sold", color: "text-emerald-400" },
  { value: "not_sold", label: "NS — Not Sold", color: "text-red-400" },
  { value: "no_bids",  label: "RPNR — Reservation Price Not Reached", color: "text-neutral-400" },
];

interface Props {
  listings: HistoryListing[];
  currency: string;
  showShipping: boolean;
}

export default function HistoryBoard({ listings, currency, showShipping }: Props) {
  const [categoryId, setCategoryId]   = useState<number | null>(null);
  const [outcome, setOutcome]         = useState<LotOutcome | "all">("all");
  const [sortMode, setSortMode]       = useState<SortMode>("date_desc");
  const [search, setSearch]           = useState("");
  const [onlyInSB, setOnlyInSB]       = useState(false);
  const [page, setPage]               = useState(1);
  const [showTopBtn, setShowTopBtn]   = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTopBtn(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [categoryId, outcome, sortMode, search, onlyInSB]);

  // Counts per outcome for badges
  const outcomeCounts = useMemo(() => ({
    sold:     listings.filter((l) => l.lot_outcome === "sold").length,
    not_sold: listings.filter((l) => l.lot_outcome === "not_sold").length,
    no_bids:  listings.filter((l) => l.lot_outcome === "no_bids").length,
    null:     listings.filter((l) => !l.lot_outcome).length,
    in_sb:    listings.filter((l) => l.sb_price != null).length,
  }), [listings]);

  const filtered = useMemo(() => {
    let list = listings;
    if (outcome !== "all") {
      list = list.filter((l) => l.lot_outcome === outcome);
    }
    if (categoryId !== null) {
      list = list.filter((l) => l.catawiki_category_id === categoryId);
    }
    if (onlyInSB) {
      list = list.filter((l) => l.sb_price != null);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((l) => l.title.toLowerCase().includes(q));
    }
    return sortHistory(list, sortMode);
  }, [listings, outcome, categoryId, sortMode, search, onlyInSB]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible    = filtered.slice(0, page * PAGE_SIZE);
  const hasMore    = page * PAGE_SIZE < filtered.length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 space-y-6">

      {showTopBtn && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-neutral-900 text-sm font-semibold hover:bg-neutral-200 transition-colors shadow-xl"
        >
          ↑ Back to Top
        </button>
      )}

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-semibold text-white">📜 Price History</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {listings.length.toLocaleString("sv-SE")} ended auctions with recorded final prices
        </p>
      </div>

      {/* ── Outcome tabs ── */}
      <div className="flex flex-wrap gap-2">
        {OUTCOMES.map((o) => {
          const count =
            o.value === "all"      ? listings.length
            : o.value === "sold"     ? outcomeCounts.sold
            : o.value === "not_sold" ? outcomeCounts.not_sold
            :                          outcomeCounts.no_bids;
          const active = outcome === o.value;
          return (
            <button
              key={o.value}
              onClick={() => setOutcome(o.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm transition-colors ${
                active
                  ? "bg-white text-black border-white font-semibold"
                  : "bg-neutral-900/60 border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
              }`}
            >
              <span className={active ? "text-black" : (o.color || "text-neutral-300")}>
                {o.label}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                active ? "bg-black/20 text-black" : "bg-neutral-800 text-neutral-400"
              }`}>
                {count.toLocaleString("sv-SE")}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title…"
          className="w-full sm:w-80 px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500"
        />

        {/* Category */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500 shrink-0 w-16">Category</span>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id ?? "all"}
              onClick={() => setCategoryId(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                categoryId === cat.id
                  ? "bg-white text-black font-medium"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500 shrink-0 w-16">Sort by</span>
          <Pill active={sortMode === "date_desc"}  onClick={() => setSortMode("date_desc")}>Newest first</Pill>
          <Pill active={sortMode === "date_asc"}   onClick={() => setSortMode("date_asc")}>Oldest first</Pill>
          <Pill active={sortMode === "price_desc"} onClick={() => setSortMode("price_desc")}>Price ↓</Pill>
          <Pill active={sortMode === "price_asc"}  onClick={() => setSortMode("price_asc")}>Price ↑</Pill>
          <Pill active={sortMode === "vs_est_asc"}  onClick={() => setSortMode("vs_est_asc")}  title="Most below estimate first">vs Est −</Pill>
          <Pill active={sortMode === "vs_est_desc"} onClick={() => setSortMode("vs_est_desc")} title="Most above estimate first">vs Est +</Pill>
        </div>

        {/* Systembolaget filter — only relevant when displaying in SEK */}
        {currency === "SEK" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500 shrink-0 w-16">SB</span>
            <Pill active={onlyInSB} onClick={() => setOnlyInSB((v) => !v)} title="Only show lots with a Systembolaget retail price">
              🇸🇪 In SB assortment
              {outcomeCounts.in_sb > 0 && (
                <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded-full ${onlyInSB ? "bg-black/20" : "bg-neutral-800 text-neutral-400"}`}>
                  {outcomeCounts.in_sb}
                </span>
              )}
            </Pill>
          </div>
        )}

      </div>

      {/* ── Result count ── */}
      <p className="text-xs text-neutral-500">
        Showing {visible.length.toLocaleString("sv-SE")} of {filtered.length.toLocaleString("sv-SE")} lots
      </p>

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center h-16 rounded-xl border border-neutral-800 text-neutral-500 text-sm">
          No ended auctions match your filters.
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 [overflow:clip]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-neutral-800 bg-neutral-900">
                  <th className="py-2 pl-2 pr-2 w-10" />
                  <th className="py-2 pr-4 text-xs font-medium text-neutral-400">Lot</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Final</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">+9%</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap min-w-[88px]">{currency} (incl 9%)</th>
                  {showShipping && (
                    <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap min-w-[72px]">Ship SE</th>
                  )}
                  {showShipping && (
                    <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap min-w-[80px]">Total {currency}</th>
                  )}
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Estimate</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">vs Est</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Bids</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Bidders</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Result</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Rating</th>
                  {currency === "SEK" && (
                    <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">SB pris</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((listing) => (
                  <HistoryRow
                    key={listing.id}
                    listing={listing}
                    currency={currency}
                    showShipping={showShipping}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="flex justify-center py-4 border-t border-neutral-800">
              <button
                onClick={() => setPage((p) => p + 1)}
                className="px-4 py-2 rounded-full bg-neutral-800 hover:bg-neutral-700 text-sm text-neutral-300 hover:text-white transition-colors border border-neutral-700"
              >
                Load more ({filtered.length - visible.length} remaining)
              </button>
            </div>
          )}

          <div className="px-3 py-1.5 text-[10px] text-neutral-600 border-t border-neutral-800">
            +9% buyer&apos;s premium{showShipping ? " · Ship SE = shipping to Sweden · Total incl. shipping" : ""}
          </div>
        </div>
      )}
    </main>
  );
}
