"use client";

import { useEffect, useRef, useState } from "react";
import type { BucketData, ClassifiedListing } from "@/lib/types";
import BucketSection from "@/components/bucket-section";
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

type ShipsFrom = "eu" | "non_eu" | null;

// Pills shown in the "Grades" row, by jewellery context.  When the user
// is in a Gold pill, the row offers karat values; in Silver, purity
// numbers; in Diamonds (or All), diamond clarity.  Filtering takes the
// raw string match against the parsed value so this stays simple.
const DIAMOND_CLARITIES = ["IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1"] as const;
const GOLD_KARATS       = ["24", "21.6", "18", "14", "9"] as const;
const SILVER_PURITIES   = ["925", "830", "900", "800", "600", "400"] as const;

// ── Category / subcategory config ─────────────────────────────────────────

/**
 * Filter pill definition. Two shapes:
 *  - top-level with optional drill-down `subcategories` (Wine → Bordeaux/…)
 *  - flattened pill that pre-fixes both `id` and `subcategoryId` and skips
 *    the drill-down row (Jewellery → Gold uses cat=313 sub=1660 directly).
 */
export interface CategoryDef {
  id: number | null;
  /** When set, clicking the pill applies BOTH this categoryId AND this subcategoryId, and the drill-down row is hidden. */
  subcategoryId?: number | null;
  label: string;
  icon: string;
  subcategories?: { id: number | null; label: string }[];
}

const WINE_CATEGORIES: CategoryDef[] = [
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

/** Default fallback so legacy callers (the wine page) don't have to pass it. */
export const DEFAULT_CATEGORIES = WINE_CATEGORIES;

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

/**
 * Detect Catawiki's "no reserve" tag in a lot title.
 * - Jewellery uses a prefix:   "No reserve price - Necklace…"
 * - Wine uses a mid-string tag: "Rémy Martin - No Reserve Price - Louis XIII…"
 *
 * Word-boundaried "no reserve" matches both shapes without false-positiving
 * on phrases like "Founder's Reserve" / "Gold Reserve" (no preceding "no").
 */
function isNoReserve(title: string): boolean {
  return /\bno\s*reserve(\s*price)?\b/i.test(title);
}

function applyFilters(
  buckets: BucketData,
  categoryId: number | null,
  subcategoryId: number | null,
  activePricePresets: Set<number>,
  activeBuckets: Set<string>,
  activeVintagePresets: Set<number>,
  search: string,
  requireLastPrice: boolean,
  requireNoReserve: boolean,
  goldColor: GoldColor | null,
  shipsFrom: ShipsFrom,
  activeGrades: Set<string>,
  activeCerts: Set<DiamondCertLab>,
): BucketData {
  const q = search.trim().toLowerCase();
  const filterList = (list: ClassifiedListing[]) =>
    list.filter((l) => {
      if (categoryId !== null && l.catawiki_category_id !== categoryId) return false;
      if (categoryId !== null && subcategoryId !== null && l.catawiki_subcategory_id !== subcategoryId) return false;
      if (q && !l.title.toLowerCase().includes(q)) return false;
      if (requireLastPrice && l.last_auction_price == null) return false;
      if (requireNoReserve && !isNoReserve(l.title)) return false;
      // Gold-colour drill-down only matters when the user is in the Gold pill.
      if (goldColor !== null && parseGoldColor(l.title) !== goldColor) return false;
      // Ships-from filter: lots with unknown seller_country are excluded
      // from both EU and Outside-EU views (we genuinely don't know).
      if (shipsFrom === "eu"     && !isEuCountry(l.seller_country)) return false;
      if (shipsFrom === "non_eu" && (l.seller_country == null || isEuCountry(l.seller_country))) return false;
      // Certificate filter: diamonds only.  When any lab pill is active,
      // require the lot to be a diamond (cat 715) AND its parsed cert lab
      // (from title or specifications) to be one of the selected labs.
      if (activeCerts.size > 0) {
        if (l.catawiki_category_id !== 715) return false;
        const lab = parseDiamondCertificate(l.title, l.specifications);
        if (!lab || !activeCerts.has(lab)) return false;
      }

      // Grades filter: matches against whichever attribute applies to the
      // lot's material — clarity for diamonds, karat for gold, purity for
      // silver. Lots whose material doesn't yield the expected attribute
      // are excluded when ANY grade is selected.
      if (activeGrades.size > 0) {
        if (l.catawiki_category_id === 715) {
          const g = parseDiamondGrade(l.title);
          if (!g || !activeGrades.has(g.clarity)) return false;
        } else if (l.catawiki_subcategory_id === 1660) {
          const k = parseGoldKarat(l.title);
          if (!k || !activeGrades.has(k)) return false;
        } else if (l.catawiki_subcategory_id === 841) {
          const p = parseSilverPurity(l.title);
          if (!p || !activeGrades.has(String(p))) return false;
        } else {
          // Material we don't grade — drop it from results when filter is on.
          return false;
        }
      }

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
  /** Filter pills shown in the top "Category" row. Defaults to wine. */
  categories?: CategoryDef[];
}

export default function ListingsBoard({
  initialBuckets,
  initialFavoriteIds,
  currency,
  showShipping,
  category = "wine-whisky-spirits",
  categories = DEFAULT_CATEGORIES,
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
  const [requireNoReserve, setRequireNoReserve] = useState(false);
  const [goldColor, setGoldColor] = useState<GoldColor | null>(null);
  const [shipsFrom, setShipsFrom] = useState<ShipsFrom>(null);
  const [activeGrades, setActiveGrades] = useState<Set<string>>(new Set());
  const [activeCerts,  setActiveCerts]  = useState<Set<DiamondCertLab>>(new Set());
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

  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? null;
  // Gold-colour pill only meaningfully applies when the user is in the Gold
  // top-level pill (Jewellery → Gold = cat 313 / sub 1660). Treat it as null
  // otherwise so it doesn't filter out non-gold lots.
  const inGold = activeCategoryId === 313 && activeSubcategoryId === 1660;
  const effectiveGoldColor = inGold ? goldColor : null;

  const filtered = applyFilters(
    buckets, activeCategoryId, activeSubcategoryId,
    activePricePresets, activeBuckets, activeVintagePresets,
    search, requireLastPrice, requireNoReserve, effectiveGoldColor,
    shipsFrom, activeGrades, activeCerts,
  );

  const sorted: BucketData = {
    ending_soon: sortListings(filtered.ending_soon, sortMode),
    low_price:   sortListings(filtered.low_price,   sortMode),
    good_price:  sortListings(filtered.good_price,  sortMode),
    ok_price:    sortListings(filtered.ok_price,    sortMode),
    overpriced:  sortListings(filtered.overpriced,  sortMode),
    rest:        sortListings(filtered.rest,         sortMode),
  };

  // "Visar X utav Y auktioner" counter shown above the bucket sections.
  // Total = the SSE snapshot before any client-side filter; visible = post.
  const sumBuckets = (b: BucketData) =>
    b.ending_soon.length + b.low_price.length + b.good_price.length +
    b.ok_price.length    + b.overpriced.length + b.rest.length;
  const totalCount    = sumBuckets(buckets);
  const visibleCount  = sumBuckets(sorted);
  const isFiltered    = visibleCount !== totalCount;

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

        {/* Row 1: category pills.
            For pills with `subcategoryId` pre-set (jewellery Gold/Silver,
            watches Rolex/Omega), clicking applies both ids and we skip
            the drill-down row below. Pills without it behave like before. */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => {
            const active =
              activeCategoryId === cat.id &&
              (cat.subcategoryId === undefined || activeSubcategoryId === (cat.subcategoryId ?? null));
            return (
              <button
                key={`${cat.id ?? "all"}:${cat.subcategoryId ?? ""}`}
                onClick={() => {
                  setActiveCategoryId(cat.id);
                  setActiveSubcategoryId(cat.subcategoryId ?? null);
                  // Switching pills clears the colour + grades + cert
                  // drill-downs so an IF/VVS or IGI pick doesn't silently
                  // survive from the Diamonds tab into Gold / Silver.
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

        {/* Row 2: subcategory pills (only for top-level pills WITHOUT a
            preset subcategoryId — i.e. wine-style drill-down). */}
        {activeCategory?.subcategories && activeCategory.subcategoryId === undefined && (
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

        {/* Gold-colour drill-down: only visible when the Gold pill is
            selected on the jewellery dashboard. Filters by what's parsed
            from the lot title ("18 kt. Yellow gold"). */}
        {inGold && (
          <div className="flex flex-wrap gap-2 pl-1">
            {([
              { key: null,     label: "All gold" },
              { key: "yellow", label: "🟡 Yellow" },
              { key: "white",  label: "⚪ White" },
              { key: "rose",   label: "🌹 Rose" },
              { key: "mixed",  label: "🌈 Mixed" },
            ] as { key: GoldColor | null; label: string }[]).map((opt) => (
              <button
                key={opt.key ?? "all"}
                onClick={() => setGoldColor(opt.key)}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                  goldColor === opt.key
                    ? "bg-white text-black font-medium"
                    : "bg-neutral-800/60 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {opt.label}
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

          {/* Vintage — wine-only (no concept of vintage year for jewellery /
              watches / apple). Multi-select; "Any year" clears. */}
          {category === "wine-whisky-spirits" && (
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
          )}

          {/* Grades — context-aware multi-select.
                Diamond pill (cat 715)        -> Clarity (IF…I1)
                Gold pill (cat 313 sub 1660)  -> Karat (24K…9K)
                Silver pill (cat 313 sub 841) -> Purity (925…400)
                All / no jewellery sub-pill    -> hide entirely */}
          {category === "jewellery" && (() => {
            const isGold     = activeCategoryId === 313 && activeSubcategoryId === 1660;
            const isSilver   = activeCategoryId === 313 && activeSubcategoryId === 841;
            const isDiamond  = activeCategoryId === 715;
            if (!isGold && !isSilver && !isDiamond) return null;

            const label   = isGold ? "Karat" : isSilver ? "Purity" : "Clarity";
            const options: readonly string[] =
              isGold ? GOLD_KARATS : isSilver ? SILVER_PURITIES : DIAMOND_CLARITIES;
            const renderLabel = (opt: string) =>
              isGold ? `${opt} kt` : opt;
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

          {/* Certificate — diamonds only.  Multi-select lab filter that
                inspects the lot's title + Catawiki specifications (where
                "Laboratory report" usually lives). Lots whose lab can't
                be identified are excluded when ANY pill is selected. */}
          {category === "jewellery" && activeCategoryId === 715 && (
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

          {/* Ships from — exclusive, EU vs Outside-EU vs Any. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500 shrink-0 w-16">Ships from</span>
            <Pill active={shipsFrom === null}    onClick={() => setShipsFrom(null)}>
              Any
            </Pill>
            <Pill active={shipsFrom === "eu"}    onClick={() => setShipsFrom("eu")}    title="Seller country is an EU member state">
              <span>🇪🇺 EU</span>
            </Pill>
            <Pill active={shipsFrom === "non_eu"} onClick={() => setShipsFrom("non_eu")} title="Seller country is known and outside the EU">
              <span>🌍 Outside EU</span>
            </Pill>
          </div>

          {/* Show only */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500 shrink-0 w-16">Show only</span>
            <Pill
              active={activeBuckets.size === 0 && !requireLastPrice && !requireNoReserve}
              onClick={() => {
                setActiveBuckets(new Set());
                setRequireLastPrice(false);
                setRequireNoReserve(false);
              }}
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
            <Pill
              active={requireNoReserve}
              onClick={() => setRequireNoReserve((p) => !p)}
              title='Lots whose title starts with "No reserve price"'
            >
              <span>🟢 No reserve</span>
              <span className="hidden sm:inline text-neutral-500 ml-1">· always sells</span>
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
          {category === "wine-whisky-spirits" && (
            <div className="flex gap-2">
              <dt className="font-medium min-w-[110px] shrink-0"><span className="text-amber-400">VV ★</span> / <span className="text-violet-400">CT</span></dt>
              <dd className="text-neutral-400">Vivino ★ (out of 5) and CellarTracker (out of 100) community ratings</dd>
            </div>
          )}
          {category === "wine-whisky-spirits" && currency === "SEK" && (
            <div className="flex gap-2">
              <dt className="font-medium text-blue-400 min-w-[110px] shrink-0">SB pris</dt>
              <dd className="text-neutral-400">Systembolaget retail price — click to search the SB catalogue</dd>
            </div>
          )}
          {category === "jewellery" && (
            <div className="flex gap-2">
              <dt className="font-medium text-neutral-300 min-w-[110px] shrink-0">Grade</dt>
              <dd className="text-neutral-400">
                Material-aware. For <strong>diamonds</strong>:
                shape (Round / Heart / …) ·{" "}
                <span className="text-amber-400">colour D-N</span> ·{" "}
                <span className="text-cyan-300">clarity IF/VVS/VS/SI/I</span>.
                For <strong>gold</strong>: parsed karat (e.g. <span className="text-amber-400">18 kt</span>).
                For <strong>silver</strong>: parsed purity (e.g. 925).
                Empty when the title doesn&apos;t carry the expected attribute.
              </dd>
            </div>
          )}
          {category === "jewellery" && (
            <div className="flex gap-2">
              <dt className="font-medium text-neutral-300 min-w-[110px] shrink-0">Weight</dt>
              <dd className="text-neutral-400">
                Total weight in grams. Parsed from the lot title (&ldquo;1.6 g&rdquo;) or,
                as a fallback, from Catawiki&apos;s spec rows (&ldquo;Weight&rdquo; / &ldquo;Total weight&rdquo; / &ldquo;Vikt&rdquo; / &ldquo;Gewicht&rdquo;).
              </dd>
            </div>
          )}
          {category === "jewellery" && (
            <div className="flex gap-2">
              <dt className="font-medium text-cyan-400 min-w-[110px] shrink-0">Value</dt>
              <dd className="text-neutral-400">
                Rough material / stone value, in your currency.
                Diamonds: USD/ct Pricescope-aligned table × shape factor
                (Round 1.0 · Heart 0.60 · Pear 0.65 · …) × carat-size factor.
                Gold &amp; Silver: SEK/g &ldquo;Pengar direkt&rdquo; from Kaplans, refreshed daily.
                Sanity check, not an appraisal — &ldquo;—&rdquo; when the title / specs can&apos;t be parsed.
              </dd>
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

      {/* "Visar X utav Y auktioner" — live count of filter results.
          Highlighted when any filter is narrowing the set. */}
      <div
        aria-live="polite"
        className={[
          "rounded-xl border px-4 py-2.5 text-sm flex items-center justify-between gap-3",
          isFiltered
            ? "border-blue-500/30 bg-blue-500/5 text-blue-200"
            : "border-neutral-800 bg-neutral-900/50 text-neutral-400",
        ].join(" ")}
      >
        <div>
          Visar{" "}
          <span className="font-semibold tabular-nums text-white">
            {visibleCount.toLocaleString("sv-SE")}
          </span>{" "}
          utav{" "}
          <span className="font-semibold tabular-nums text-white">
            {totalCount.toLocaleString("sv-SE")}
          </span>{" "}
          auktioner
        </div>
        {isFiltered && (
          <span className="text-xs text-neutral-500 hidden sm:inline">
            {Math.round((visibleCount / Math.max(totalCount, 1)) * 100)}% av totalen
          </span>
        )}
      </div>

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
          vertical={category as "wine-whisky-spirits" | "jewellery" | "watches" | "apple"}
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
          vertical={category as "wine-whisky-spirits" | "jewellery" | "watches" | "apple"}
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
          vertical={category as "wine-whisky-spirits" | "jewellery" | "watches" | "apple"}
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
          vertical={category as "wine-whisky-spirits" | "jewellery" | "watches" | "apple"}
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
          vertical={category as "wine-whisky-spirits" | "jewellery" | "watches" | "apple"}
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
          vertical={category as "wine-whisky-spirits" | "jewellery" | "watches" | "apple"}
        />
      )}
    </main>
  );
}
