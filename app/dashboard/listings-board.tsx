"use client";

import { useEffect, useRef, useState } from "react";
import type { BucketData, ClassifiedListing } from "@/lib/types";
import BucketSection from "@/components/bucket-section";

// ── Category / subcategory config ─────────────────────────────────────────

interface CategoryDef {
  id: number | null;
  label: string;
  icon: string;
  subcategories?: { id: number | null; label: string }[];
}

const CATEGORIES: CategoryDef[] = [
  { id: null, label: "All", icon: "🌐" },
  {
    id: 437,
    label: "Whisky",
    icon: "🥃",
    subcategories: [
      { id: null,  label: "All" },
      { id: 441,   label: "Exclusive" },
      { id: 1475,  label: "Japanese & Asian" },
      { id: 461,   label: "Regular" },
    ],
  },
  {
    id: 965,
    label: "Rum & Cognac",
    icon: "🥃",
    subcategories: [
      { id: null,  label: "All" },
      { id: 705,   label: "Rum" },
      { id: 1477,  label: "Exclusive Rum" },
      { id: 615,   label: "Cognac & Armagnac" },
      { id: 1503,  label: "Exclusive Cognac" },
      { id: 967,   label: "Fine Spirits" },
      { id: 1638,  label: "Chartreuse" },
    ],
  },
  {
    id: 443,
    label: "Wine",
    icon: "🍷",
    subcategories: [
      { id: null, label: "All" },
      { id: 447,  label: "Exclusive" },
      { id: 695,  label: "Bordeaux Grand Cru" },
      { id: 765,  label: "Burgundy Crus" },
      { id: 463,  label: "Premium" },
      { id: 1025, label: "Italian" },
      { id: 1473, label: "Rhône Valley" },
      { id: 937,  label: "Spanish & Portuguese" },
      { id: 737,  label: "Big Bottles" },
    ],
  },
  {
    id: 961,
    label: "Champagne",
    icon: "🥂",
    subcategories: [
      { id: null, label: "All" },
      { id: 613,  label: "Champagne" },
      { id: 929,  label: "Dom Pérignon" },
    ],
  },
  {
    id: 971,
    label: "Port & Sweet",
    icon: "🍷",
    subcategories: [
      { id: null, label: "All" },
      { id: 449,  label: "Port & Madeira" },
      { id: 973,  label: "Dessert & Sweet Wines" },
    ],
  },
  { id: 963, label: "Beer", icon: "🍺" },
];

// ── Price preset config ────────────────────────────────────────────────────

const PRICE_PRESETS = [
  { label: "All",      min: 0,    max: null  },
  { label: "< €250",   min: 0,    max: 250   },
  { label: "€250–500", min: 250,  max: 500   },
  { label: "€500–1k",  min: 500,  max: 1000  },
  { label: "€1000+",   min: 1000, max: null  },
] as const;

// ── Vintage year filter ────────────────────────────────────────────────────

const VINTAGE_PRESETS = [
  { label: "Any year",  minYear: 0,    maxYear: 9999 },
  { label: "2020+",     minYear: 2020, maxYear: 9999 },
  { label: "2015–2019", minYear: 2015, maxYear: 2019 },
  { label: "2010–2014", minYear: 2010, maxYear: 2014 },
  { label: "2000–2009", minYear: 2000, maxYear: 2009 },
  { label: "< 2000",    minYear: 0,    maxYear: 1999 },
] as const;

function extractYear(title: string): number | null {
  const matches = title.match(/\b(19\d{2}|20[012]\d)\b/g);
  if (!matches) return null;
  const years = matches.map(Number).filter((y) => y >= 1900 && y <= 2030);
  return years.length > 0 ? Math.min(...years) : null;
}

// ── Sort helpers ───────────────────────────────────────────────────────────

type SortMode = "end_time" | "price_asc" | "price_desc" | "vs_est";

function vsEstPct(l: ClassifiedListing): number {
  const { current_bid: bid, estimated_low: low, estimated_high: high } = l;
  if (!bid || !low || !high) return Infinity;
  const mid = (low + high) / 2;
  return ((bid - mid) / mid) * 100;
}

// ── Bucket filter config ───────────────────────────────────────────────────

// Filter pills shown above the table. `key` is the canonical bucket id
// (matches the BucketData fields and the SSE payload); `label` is what the
// user sees. We use neutral tier-style labels so the UI doesn't surface
// distinctive vocabulary.
const BUCKET_FILTERS = [
  { key: "ending_soon", icon: "⏰", label: "Quiet endings", desc: "ending within 6h, no bids" },
  { key: "low_price",   icon: "🟢", label: "Tier S",        desc: "bid ≤50% of estimate" },
  { key: "good_price",  icon: "💎", label: "Tier A",        desc: "bid 50–70% of estimate" },
  { key: "ok_price",    icon: "👍", label: "Tier B",        desc: "bid 70–90% of estimate" },
  { key: "overpriced",  icon: "🔴", label: "Premium",        desc: "15%+ above high estimate" },
  { key: "rest",        icon: "📋", label: "Other lots",    desc: "no estimate / unclassified" },
] as const;

// ── Filter + sort logic ────────────────────────────────────────────────────

function applyFilters(
  buckets: BucketData,
  categoryId: number | null,
  subcategoryId: number | null,
  activePricePresets: Set<number>,
  activeBuckets: Set<string>,
  activeVintagePresets: Set<number>,
  search: string,
  requireLastPrice: boolean,
): BucketData {
  const q = search.trim().toLowerCase();
  const filterList = (list: ClassifiedListing[]) =>
    list.filter((l) => {
      if (categoryId !== null && l.catawiki_category_id !== categoryId) return false;
      if (categoryId !== null && subcategoryId !== null && l.catawiki_subcategory_id !== subcategoryId) return false;
      if (q && !l.title.toLowerCase().includes(q)) return false;
      if (requireLastPrice && l.last_auction_price == null) return false;

      if (activePricePresets.size > 0) {
        const bid = l.current_bid ?? 0;
        const ok = [...activePricePresets].some((i) => {
          const { min, max } = PRICE_PRESETS[i];
          return bid >= min && (max === null || bid <= max);
        });
        if (!ok) return false;
      }

      if (activeVintagePresets.size > 0) {
        const year = extractYear(l.title);
        if (year === null) return false;
        const ok = [...activeVintagePresets].some((i) => {
          const { minYear, maxYear } = VINTAGE_PRESETS[i];
          return year >= minYear && year <= maxYear;
        });
        if (!ok) return false;
      }

      return true;
    });

  const filtered: BucketData = {
    ending_soon: filterList(buckets.ending_soon),
    low_price:   filterList(buckets.low_price),
    good_price:  filterList(buckets.good_price),
    ok_price:    filterList(buckets.ok_price),
    overpriced:  filterList(buckets.overpriced),
    rest:        filterList(buckets.rest),
  };

  if (activeBuckets.size > 0) {
    return {
      ending_soon: activeBuckets.has("ending_soon") ? filtered.ending_soon : [],
      low_price:   activeBuckets.has("low_price")   ? filtered.low_price   : [],
      good_price:  activeBuckets.has("good_price")  ? filtered.good_price  : [],
      ok_price:    activeBuckets.has("ok_price")    ? filtered.ok_price    : [],
      overpriced:  activeBuckets.has("overpriced")  ? filtered.overpriced  : [],
      rest:        activeBuckets.has("rest")         ? filtered.rest        : [],
    };
  }

  return filtered;
}

function sortListings(list: ClassifiedListing[], mode: SortMode): ClassifiedListing[] {
  switch (mode) {
    case "end_time":  return list; // server already orders by ends_at
    case "price_asc": return [...list].sort((a, b) => (a.current_bid ?? 0) - (b.current_bid ?? 0));
    case "price_desc":return [...list].sort((a, b) => (b.current_bid ?? 0) - (a.current_bid ?? 0));
    case "vs_est":    return [...list].sort((a, b) => vsEstPct(a) - vsEstPct(b));
  }
}

// ── Pill button helper ─────────────────────────────────────────────────────

function Pill({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
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

// ── Main component ────────────────────────────────────────────────────────

interface Props {
  initialBuckets: BucketData;
  initialFavoriteIds: string[];
  currency: string;
  showShipping: boolean;
  /**
   * Vertical to subscribe the SSE stream to. Defaults to wine-whisky-spirits
   * for backward compat. Pass "jewellery" / "watches" from the corresponding
   * dashboards.
   */
  category?: string;
}

export default function ListingsBoard({
  initialBuckets,
  initialFavoriteIds,
  currency,
  showShipping,
  category = "wine-whisky-spirits",
}: Props) {
  const [buckets, setBuckets]         = useState<BucketData>(initialBuckets);
  const [favoriteIds, setFavoriteIds] = useState(new Set(initialFavoriteIds));
  const [connected, setConnected]     = useState(true);

  const [activeCategoryId, setActiveCategoryId]       = useState<number | null>(null);
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<number | null>(null);
  const [activePricePresets, setActivePricePresets]     = useState<Set<number>>(new Set());
  const [activeVintagePresets, setActiveVintagePresets] = useState<Set<number>>(new Set());
  const [sortMode, setSortMode]           = useState<SortMode>("end_time");
  const [activeBuckets, setActiveBuckets] = useState<Set<string>>(new Set());
  const [requireLastPrice, setRequireLastPrice] = useState(false);
  const [search, setSearch]               = useState("");

  const [showTopBtn, setShowTopBtn] = useState(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const esRef    = useRef<EventSource | null>(null);

  useEffect(() => {
    const onScroll = () => setShowTopBtn(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function connect() {
      const es = new EventSource(`/api/stream?category=${encodeURIComponent(category)}`);
      esRef.current = es;
      es.onopen = () => setConnected(true);
      es.addEventListener("snapshot", (e: MessageEvent<string>) => {
        setBuckets(JSON.parse(e.data) as BucketData);
      });
      es.onerror = () => {
        setConnected(false);
        es.close();
        retryRef.current = setTimeout(connect, 3000);
      };
    }
    connect();
    return () => { clearTimeout(retryRef.current); esRef.current?.close(); };
  }, []);

  const toggleBucket = (key: string) => {
    setActiveBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleToggleFavorite = (id: string, isFav: boolean) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.add(id); else next.delete(id);
      return next;
    });
  };

  const activeCategory = CATEGORIES.find((c) => c.id === activeCategoryId) ?? null;
  const filtered = applyFilters(
    buckets, activeCategoryId, activeSubcategoryId,
    activePricePresets, activeBuckets, activeVintagePresets,
    search, requireLastPrice,
  );

  const sorted: BucketData = {
    ending_soon: sortListings(filtered.ending_soon, sortMode),
    low_price:   sortListings(filtered.low_price,   sortMode),
    good_price:  sortListings(filtered.good_price,  sortMode),
    ok_price:    sortListings(filtered.ok_price,    sortMode),
    overpriced:  sortListings(filtered.overpriced,  sortMode),
    rest:        sortListings(filtered.rest,         sortMode),
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 space-y-8">
      {!connected && (
        <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 px-4 py-2 text-sm text-orange-400 text-center">
          Connection lost — reconnecting…
        </div>
      )}

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

        {/* Row 1: category pills */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id ?? "all"}
              onClick={() => { setActiveCategoryId(cat.id); setActiveSubcategoryId(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                activeCategoryId === cat.id
                  ? "bg-white text-black font-medium"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Row 2: subcategory pills (conditional) */}
        {activeCategory?.subcategories && (
          <div className="flex flex-wrap gap-2 pl-1">
            {activeCategory.subcategories.map((sub) => (
              <button
                key={sub.id ?? "all"}
                onClick={() => setActiveSubcategoryId(sub.id)}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                  activeSubcategoryId === sub.id
                    ? "bg-white text-black font-medium"
                    : "bg-neutral-800/60 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {sub.label}
              </button>
            ))}
          </div>
        )}

        {/* Row 3: price · sort · vintage · show only */}
        <div className="flex flex-col gap-2 pt-2 border-t border-neutral-800">

          {/* Price presets — multi-select, All clears others */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500 shrink-0 w-16">Price</span>
            <Pill active={activePricePresets.size === 0} onClick={() => setActivePricePresets(new Set())}>
              All
            </Pill>
            {PRICE_PRESETS.slice(1).map((p, i) => {
              const idx = i + 1;
              return (
                <Pill
                  key={idx}
                  active={activePricePresets.has(idx)}
                  onClick={() => setActivePricePresets((prev) => {
                    const next = new Set(prev);
                    if (next.has(idx)) next.delete(idx); else next.add(idx);
                    return next;
                  })}
                >
                  {p.label}
                </Pill>
              );
            })}
          </div>

          {/* Sort — exclusive, one active at a time */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500 shrink-0 w-16">Sort by</span>
            <Pill active={sortMode === "end_time"}   onClick={() => setSortMode("end_time")}>End time</Pill>
            <Pill active={sortMode === "price_asc"}  onClick={() => setSortMode("price_asc")}>Price ↑</Pill>
            <Pill active={sortMode === "price_desc"} onClick={() => setSortMode("price_desc")}>Price ↓</Pill>
            <Pill active={sortMode === "vs_est"}     onClick={() => setSortMode("vs_est")} title="Most below estimate first">vs Est %</Pill>
          </div>

          {/* Vintage — multi-select, All clears others */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500 shrink-0 w-16">Vintage</span>
            <Pill active={activeVintagePresets.size === 0} onClick={() => setActiveVintagePresets(new Set())}>
              Any year
            </Pill>
            {VINTAGE_PRESETS.slice(1).map((v, i) => {
              const idx = i + 1;
              return (
                <Pill
                  key={idx}
                  active={activeVintagePresets.has(idx)}
                  onClick={() => setActiveVintagePresets((prev) => {
                    const next = new Set(prev);
                    if (next.has(idx)) next.delete(idx); else next.add(idx);
                    return next;
                  })}
                >
                  {v.label}
                </Pill>
              );
            })}
          </div>

          {/* Show only */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500 shrink-0 w-16">Show only</span>
            <Pill
              active={activeBuckets.size === 0 && !requireLastPrice}
              onClick={() => { setActiveBuckets(new Set()); setRequireLastPrice(false); }}
            >
              All
            </Pill>
            {BUCKET_FILTERS.map(({ key, icon, label, desc }) => (
              <Pill key={key} active={activeBuckets.has(key)} onClick={() => toggleBucket(key)} title={desc}>
                <span>{icon} {label}</span>
                <span className="hidden sm:inline text-neutral-500 ml-1">· {desc}</span>
              </Pill>
            ))}
            <Pill
              active={requireLastPrice}
              onClick={() => setRequireLastPrice((p) => !p)}
              title="Only listings with a known previous auction price"
            >
              <span>💰 Last price</span>
              <span className="hidden sm:inline text-neutral-500 ml-1">· has prior</span>
            </Pill>
          </div>

        </div>
      </div>

      {/* ── Column guide ── */}
      <details className="rounded-xl border border-neutral-800 bg-neutral-900/50 group" open>
        <summary className="cursor-pointer list-none flex items-center justify-between gap-2 px-4 py-3 text-xs uppercase tracking-wider text-neutral-400 hover:text-neutral-200 transition-colors">
          <span>📖 Column guide</span>
          <span
            aria-hidden
            className="flex items-center justify-center w-7 h-7 rounded-full border border-neutral-700 bg-neutral-800 text-neutral-200 text-base leading-none group-hover:bg-neutral-700 group-hover:border-neutral-600 group-open:rotate-180 transition-all"
          >▾</span>
        </summary>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 px-4 pb-4 pt-1 text-xs border-t border-neutral-800/60">
          <div className="flex gap-2">
            <dt className="font-medium text-white min-w-[110px] shrink-0">Bid</dt>
            <dd className="text-neutral-400">Current top bid in € (lot&apos;s listed currency)</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-white min-w-[110px] shrink-0">+9%</dt>
            <dd className="text-neutral-400">Catawiki buyer&apos;s premium added on top (€)</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-yellow-400 min-w-[110px] shrink-0">{currency} (incl 9%)</dt>
            <dd className="text-neutral-400">Auction total in your currency, premium included</dd>
          </div>
          {showShipping && (
            <div className="flex gap-2">
              <dt className="font-medium text-white min-w-[110px] shrink-0">Ship SE</dt>
              <dd className="text-neutral-400">Estimated shipping cost to Sweden (€). &quot;Free&quot; when included by seller.</dd>
            </div>
          )}
          {showShipping && (
            <div className="flex gap-2">
              <dt className="font-medium text-orange-300 min-w-[110px] shrink-0">Total {currency}</dt>
              <dd className="text-neutral-400">Final landed cost in your currency: bid + 9% + shipping</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="font-medium text-purple-400 min-w-[110px] shrink-0">Last price</dt>
            <dd className="text-neutral-400">Last winning price for the same or similar lot, with the closing date</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium min-w-[110px] shrink-0"><span className="text-amber-400">VV ★</span> / <span className="text-violet-400">CT</span></dt>
            <dd className="text-neutral-400">Vivino ★ (out of 5) and CellarTracker (out of 100) community ratings</dd>
          </div>
          {currency === "SEK" && (
            <div className="flex gap-2">
              <dt className="font-medium text-blue-400 min-w-[110px] shrink-0">SB pris</dt>
              <dd className="text-neutral-400">Systembolaget retail price — click to search the SB catalogue</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="font-medium text-neutral-300 min-w-[110px] shrink-0">Estimate</dt>
            <dd className="text-neutral-400">Auctioneer&apos;s low–high estimate range (€)</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium min-w-[110px] shrink-0 text-neutral-300">vs Est</dt>
            <dd className="text-neutral-400">
              Bid vs estimate midpoint.{" "}
              <span className="text-emerald-400">≤ −30% great</span>{" · "}
              <span className="text-blue-400">≤ −10% decent</span>{" · "}
              <span className="text-red-400">&gt; +15% overpriced</span>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-white min-w-[110px] shrink-0">Time left</dt>
            <dd className="text-neutral-400">Countdown to auction close. Lots already in &quot;Ending soon&quot; bucket get ≤ 6 h.</dd>
          </div>
        </dl>
      </details>

      {showTopBtn && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-neutral-900 text-sm font-semibold hover:bg-neutral-200 transition-colors shadow-xl"
        >
          ↑ Back to Top
        </button>
      )}

      {/* ── Bucket sections ── */}
      {(activeBuckets.size === 0 || activeBuckets.has("ending_soon")) && (
        <BucketSection
          title="⏰ Quiet endings"
          listings={sorted.ending_soon}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          accent="red"
          emptyMessage="No lots ending within 6 hours without bids right now."
          currency={currency}
          showShipping={showShipping}
        />
      )}
      {(activeBuckets.size === 0 || activeBuckets.has("low_price")) && (
        <BucketSection
          title="🟢 Tier S"
          listings={sorted.low_price}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          accent="green"
          emptyMessage="No lots at ≥50% below estimate right now."
          currency={currency}
          showShipping={showShipping}
        />
      )}
      {(activeBuckets.size === 0 || activeBuckets.has("good_price")) && (
        <BucketSection
          title="💎 Tier A"
          listings={sorted.good_price}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          accent="green"
          emptyMessage="No lots at 30–50% below estimate right now."
          currency={currency}
          showShipping={showShipping}
        />
      )}
      {(activeBuckets.size === 0 || activeBuckets.has("ok_price")) && (
        <BucketSection
          title="👍 Tier B"
          listings={sorted.ok_price}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          accent="neutral"
          emptyMessage="No lots at 10–30% below estimate right now."
          currency={currency}
          showShipping={showShipping}
        />
      )}
      {(activeBuckets.size === 0 || activeBuckets.has("overpriced")) && (
        <BucketSection
          title="🔴 Premium"
          listings={sorted.overpriced}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          accent="red"
          emptyMessage="No lots more than 15% above the high estimate right now."
          currency={currency}
          showShipping={showShipping}
        />
      )}
      {(activeBuckets.size === 0 || activeBuckets.has("rest")) && (
        <BucketSection
          title="📋 Other lots"
          listings={sorted.rest}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          accent="neutral"
          emptyMessage="No unclassified active lots right now."
          currency={currency}
          showShipping={showShipping}
        />
      )}
    </main>
  );
}
