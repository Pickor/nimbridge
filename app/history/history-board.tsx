"use client";

import { useEffect, useMemo, useState } from "react";
import type { HistoryListing, LotOutcome } from "@/lib/types";
import HistoryRow from "@/components/history-row";
import {
  parseGoldColor,
  type GoldColor,
  parseDiamondGrade,
  parseGoldKarat,
  parseSilverPurity,
  parseDiamondCertificate,
  DIAMOND_CERT_LABS,
  DIAMOND_CERT_LABEL,
  type DiamondCertLab,
} from "@/lib/jewellery-value";
import { isEuCountry } from "@/lib/eu-countries";
import type { CategoryDef } from "@/app/dashboard/listings-board";

type ShipsFrom = "eu" | "non_eu" | null;

// Grades values, mirrored from app/dashboard/listings-board.tsx so the
// History page exposes the same context-aware Clarity / Karat / Purity row.
const DIAMOND_CLARITIES = ["IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1"] as const;
const GOLD_KARATS       = ["24", "21.6", "18", "14", "9"] as const;
const SILVER_PURITIES   = ["925", "830", "900", "800", "600", "400"] as const;

// Default (wine) category list — used when a page doesn't pass its own.
// History wine pills are flat (no drill-down subcategories) for now, so
// the shape collapses to `{ id, label, icon }`.
const DEFAULT_WINE_CATEGORIES: CategoryDef[] = [
  { id: null,  label: "All",           icon: "🌐" },
  { id: 437,   label: "Whisky",        icon: "🥃" },
  { id: 965,   label: "Rum & Cognac",  icon: "🥃" },
  { id: 443,   label: "Wine",          icon: "🍷" },
  { id: 961,   label: "Champagne",     icon: "🥂" },
  { id: 971,   label: "Port & Sweet",  icon: "🍷" },
  { id: 963,   label: "Beer",          icon: "🍺" },
];

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
  /** Vertical the rows belong to. Hides Rating + SB pris on non-wine. */
  vertical?: "wine-whisky-spirits" | "jewellery" | "watches" | "apple";
  /**
   * Per-vertical category pills. Defaults to the wine list. Passed in
   * from app/history/jewellery and app/history/watches so each vertical
   * gets its own pills and drill-down behaviour.
   */
  categories?: CategoryDef[];
}

export default function HistoryBoard({
  listings, currency, showShipping,
  vertical = "wine-whisky-spirits",
  categories = DEFAULT_WINE_CATEGORIES,
}: Props) {
  const isWine = vertical === "wine-whisky-spirits";
  const isJewellery = vertical === "jewellery";

  const [categoryId, setCategoryId]                 = useState<number | null>(null);
  const [subcategoryId, setSubcategoryId]           = useState<number | null>(null);
  const [outcome, setOutcome]                       = useState<LotOutcome | "all">("all");
  const [sortMode, setSortMode]                     = useState<SortMode>("date_desc");
  const [search, setSearch]                         = useState("");
  const [onlyInSB, setOnlyInSB]                     = useState(false);
  // Jewellery / watches filters — mirror the Deals dashboard rows.
  const [goldColor, setGoldColor]                   = useState<GoldColor | null>(null);
  const [activeGrades, setActiveGrades]             = useState<Set<string>>(new Set());
  const [activeCerts, setActiveCerts]               = useState<Set<DiamondCertLab>>(new Set());
  const [shipsFrom, setShipsFrom]                   = useState<ShipsFrom>(null);

  const [page, setPage]               = useState(1);
  const [showTopBtn, setShowTopBtn]   = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTopBtn(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Reset page when any filter changes.
  useEffect(() => { setPage(1); }, [
    categoryId, subcategoryId, outcome, sortMode, search, onlyInSB,
    goldColor, activeGrades, activeCerts, shipsFrom,
  ]);

  // Gold-colour drill-down only meaningfully applies inside the Gold pill
  // (cat 313 / sub 1660). Treat it as null otherwise so it doesn't filter
  // out non-gold lots.
  const inGold = categoryId === 313 && subcategoryId === 1660;
  const effectiveGoldColor = inGold ? goldColor : null;

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
      if (subcategoryId !== null) {
        list = list.filter((l) => l.catawiki_subcategory_id === subcategoryId);
      }
    }
    if (onlyInSB) {
      list = list.filter((l) => l.sb_price != null);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((l) => l.title.toLowerCase().includes(q));
    }
    if (effectiveGoldColor !== null) {
      list = list.filter((l) => parseGoldColor(l.title) === effectiveGoldColor);
    }
    if (shipsFrom === "eu") {
      list = list.filter((l) => isEuCountry(l.seller_country));
    } else if (shipsFrom === "non_eu") {
      list = list.filter((l) => l.seller_country != null && !isEuCountry(l.seller_country));
    }
    // Certificate (Diamonds only). auction_results doesn't store
    // specifications, so we match against the title alone — same regex as
    // the Deals dashboard. Lots without a detectable lab are dropped when
    // any pill is active (matches Deals behaviour).
    if (activeCerts.size > 0) {
      list = list.filter((l) => {
        if (l.catawiki_category_id !== 715) return false;
        const lab = parseDiamondCertificate(l.title);
        return lab !== null && activeCerts.has(lab);
      });
    }
    // Grades — context-aware: clarity for diamonds, karat for gold,
    // purity for silver. Other materials are dropped when any pill is on.
    if (activeGrades.size > 0) {
      list = list.filter((l) => {
        if (l.catawiki_category_id === 715) {
          const g = parseDiamondGrade(l.title);
          return !!g && activeGrades.has(g.clarity);
        }
        if (l.catawiki_subcategory_id === 1660) {
          const k = parseGoldKarat(l.title);
          return !!k && activeGrades.has(k);
        }
        if (l.catawiki_subcategory_id === 841) {
          const p = parseSilverPurity(l.title);
          return p !== null && activeGrades.has(String(p));
        }
        return false;
      });
    }
    return sortHistory(list, sortMode);
  }, [
    listings, outcome, categoryId, subcategoryId, sortMode, search, onlyInSB,
    effectiveGoldColor, shipsFrom, activeCerts, activeGrades,
  ]);

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

        {/* Category — pills with optional pre-set subcategoryId (jewellery
            Gold/Silver, watches Rolex/Omega) apply both ids in one click
            and skip the drill-down row. Otherwise we render a sub-row when
            the active category exposes `subcategories`. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500 shrink-0 w-16">Category</span>
          {categories.map((cat) => {
            const active =
              categoryId === cat.id &&
              (cat.subcategoryId === undefined || subcategoryId === (cat.subcategoryId ?? null));
            return (
              <button
                key={`${cat.id ?? "all"}:${cat.subcategoryId ?? ""}`}
                onClick={() => {
                  setCategoryId(cat.id);
                  setSubcategoryId(cat.subcategoryId ?? null);
                  // Switching pills clears the drill-downs so a stale
                  // IF/VVS or IGI pick doesn't survive into Gold/Silver.
                  setGoldColor(null);
                  setActiveGrades(new Set());
                  setActiveCerts(new Set());
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                  active
                    ? "bg-white text-black font-medium"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Drill-down subcategory pills — only for top-level pills WITHOUT
            a preset subcategoryId (matches Deals dashboard behaviour). */}
        {(() => {
          const activeCat = categories.find((c) => c.id === categoryId) ?? null;
          if (!activeCat?.subcategories || activeCat.subcategoryId !== undefined) return null;
          return (
            <div className="flex flex-wrap gap-2 pl-1">
              {activeCat.subcategories.map((sub) => (
                <button
                  key={sub.id ?? "all"}
                  onClick={() => setSubcategoryId(sub.id)}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                    subcategoryId === sub.id
                      ? "bg-white text-black font-medium"
                      : "bg-neutral-800/60 text-neutral-400 hover:bg-neutral-700"
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          );
        })()}

        {/* Gold-colour drill-down — jewellery Gold pill only. */}
        {isJewellery && inGold && (
          <div className="flex flex-wrap gap-2 pl-1">
            {([
              { key: null,     label: "All gold" },
              { key: "yellow", label: "🟡 Yellow" },
              { key: "white",  label: "⚪ White" },
              { key: "rose",   label: "🌹 Rose" },
              { key: "mixed",  label: "🌈 Mixed" },
            ] as { key: GoldColor | null; label: string }[]).map((g) => (
              <button
                key={g.key ?? "all"}
                onClick={() => setGoldColor(g.key)}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                  goldColor === g.key
                    ? "bg-white text-black font-medium"
                    : "bg-neutral-800/60 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

        {/* Grades — context-aware Clarity / Karat / Purity, jewellery only. */}
        {isJewellery && (() => {
          const isGold    = categoryId === 313 && subcategoryId === 1660;
          const isSilver  = categoryId === 313 && subcategoryId === 841;
          const isDiamond = categoryId === 715;
          if (!isGold && !isSilver && !isDiamond) return null;
          const label   = isGold ? "Karat" : isSilver ? "Purity" : "Clarity";
          const options: readonly string[] =
            isGold ? GOLD_KARATS : isSilver ? SILVER_PURITIES : DIAMOND_CLARITIES;
          const renderLabel = (opt: string) => isGold ? `${opt} kt` : opt;
          const tooltip = (opt: string) =>
            isGold   ? `Gold ${opt} kt` :
            isSilver ? `Silver ${opt}/1000` :
                       `Diamond clarity ${opt}`;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-500 shrink-0 w-16">{label}</span>
              <Pill
                active={activeGrades.size === 0}
                onClick={() => setActiveGrades(new Set())}
                title={`Show all ${label.toLowerCase()} values`}
              >
                Any
              </Pill>
              {options.map((g) => (
                <Pill
                  key={g}
                  active={activeGrades.has(g)}
                  onClick={() =>
                    setActiveGrades((prev) => {
                      const next = new Set(prev);
                      if (next.has(g)) next.delete(g); else next.add(g);
                      return next;
                    })
                  }
                  title={tooltip(g)}
                >
                  {renderLabel(g)}
                </Pill>
              ))}
            </div>
          );
        })()}

        {/* Certificate — diamonds only. auction_results has no
            specifications column, so this matches against title only. */}
        {isJewellery && categoryId === 715 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500 shrink-0 w-16">Certificate</span>
            <Pill
              active={activeCerts.size === 0}
              onClick={() => setActiveCerts(new Set())}
              title="Show diamonds with any (or no) lab report"
            >
              Any
            </Pill>
            {DIAMOND_CERT_LABS.map((lab) => (
              <Pill
                key={lab}
                active={activeCerts.has(lab)}
                onClick={() =>
                  setActiveCerts((prev) => {
                    const next = new Set(prev);
                    if (next.has(lab)) next.delete(lab); else next.add(lab);
                    return next;
                  })
                }
                title={`Match diamonds graded by ${DIAMOND_CERT_LABEL[lab]}`}
              >
                {DIAMOND_CERT_LABEL[lab]}
              </Pill>
            ))}
          </div>
        )}

        {/* Ships from — jewellery + watches only. Wine archives don't
            currently surface seller country in the same way, and the
            existing wine UX doesn't have this row. */}
        {(isJewellery || vertical === "watches") && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500 shrink-0 w-16">Ships from</span>
            <Pill active={shipsFrom === null}     onClick={() => setShipsFrom(null)}>
              Any
            </Pill>
            <Pill active={shipsFrom === "eu"}     onClick={() => setShipsFrom("eu")}     title="Seller country is an EU member state">
              <span>🇪🇺 EU</span>
            </Pill>
            <Pill active={shipsFrom === "non_eu"} onClick={() => setShipsFrom("non_eu")} title="Seller country is known and outside the EU">
              <span>🌍 Outside EU</span>
            </Pill>
          </div>
        )}

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

        {/* Systembolaget filter — wine vertical only, and only relevant
            when displaying in SEK. SB pris doesn't apply to jewellery /
            watches so the row is hidden for non-wine. */}
        {isWine && currency === "SEK" && (
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
                  {isJewellery && (
                    <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Value</th>
                  )}
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Estimate</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">vs Est</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Bids</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Bidders</th>
                  <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Result</th>
                  {isWine && (
                    <th className="py-2 pr-3 text-xs font-medium text-neutral-400 text-right whitespace-nowrap">Rating</th>
                  )}
                  {isWine && currency === "SEK" && (
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
                    vertical={vertical}
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
