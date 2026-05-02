/**
 * Catawiki scraper using Catawiki's internal buyer API + Next.js _next/data endpoint.
 * No public API exists; these endpoints are reverse-engineered from their Next.js bundle.
 * They may change without notice.
 *
 * Approach:
 * 1. /buyer/api/v1/categories/{id}/lots  — JSON, lists lot IDs (25/page)
 * 2. /_next/data/{buildId}/en/l/{id}.json — JSON, returns full SSR page props per lot
 *    (same as __NEXT_DATA__ in HTML but as a direct JSON API — avoids HTML bot-detection)
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BASE_URL = "https://www.catawiki.com";
// Category page used only to extract the Next.js buildId
const BUILDID_PAGE = "/en/c/437-whisky";

export type LotOutcome = "sold" | "not_sold" | "no_bids";

export interface ScrapedLot {
  catawiki_id: string;
  url: string;
  title: string;
  image_url: string | null;
  current_bid: number | null;
  currency: string;
  estimated_low: number | null;
  estimated_high: number | null;
  bid_count: number;
  unique_bidders: number;
  lot_outcome: LotOutcome | null;
  ends_at: string;
  seller: string | null;
  /** Seller's country — ISO-2 code if Catawiki gives one, free-text country name otherwise. */
  seller_country: string | null;
  catawiki_category_id: number;
  catawiki_subcategory_id: number | null;
  shipping_cost_eur: number | null;
  specifications: Array<{ name: string; value: string }> | null;
}

// ── helpers ────────────────────────────────────────────────────────────────

function jitter(minMs = 800, maxMs = 2000): number {
  return minMs + Math.random() * (maxMs - minMs);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Full browser-like headers including Sec-Fetch-* and client hints.
// GitHub Actions was blocked (403) on HTML pages without these; adding them
// passes Cloudflare's bot-detection check.
const BROWSER_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Cache-Control": "max-age=0",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
};

const API_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

async function fetchJson<T>(url: string, extraHeaders?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { ...API_HEADERS, Accept: "application/json", ...extraHeaders },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn(`[catawiki] HTTP ${res.status} → ${url}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[catawiki] fetchJson error → ${url}:`, err);
    return null;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        ...BROWSER_HEADERS,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn(`[catawiki] HTTP ${res.status} → ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error(`[catawiki] fetchHtml error → ${url}:`, err);
    return null;
  }
}

// ── Next.js build ID ───────────────────────────────────────────────────────

let cachedBuildId: string | null = null;

async function getBuildId(): Promise<string | null> {
  if (cachedBuildId) return cachedBuildId;

  const html = await fetchHtml(`${BASE_URL}${BUILDID_PAGE}`);
  if (!html) return null;

  const m = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  cachedBuildId = m?.[1] ?? null;
  if (cachedBuildId) {
    console.log(`[catawiki] buildId: ${cachedBuildId}`);
  } else {
    console.warn("[catawiki] could not extract buildId from category page");
  }
  return cachedBuildId;
}

// ── shipping API ───────────────────────────────────────────────────────────

interface ShippingRate {
  region_code: string;
  price: number; // in euro-cents
  currency_code: string;
}

interface ShippingApiResponse {
  shipping?: {
    rates?: ShippingRate[];
  };
}

async function fetchShippingCostEur(catawikiId: string): Promise<number | null> {
  const url = `${BASE_URL}/buyer/api/v2/lots/${catawikiId}/shipping?currency_code=EUR`;
  const data = await fetchJson<ShippingApiResponse>(url);
  if (!data?.shipping) return null;

  const rates = data.shipping.rates ?? [];

  // Log all rates so we can debug mismatches between API and listing page
  if (rates.length > 0) {
    console.log(`  [shipping] all rates: ${rates.map((r) => `${r.region_code}=${r.price / 100}`).join(", ")}`);
  }

  // 1. Try Sweden-specific rate first (if multiple carriers, take cheapest)
  const seRates = rates.filter((r) => r.region_code === "se");
  if (seRates.length > 0) {
    const minPrice = Math.min(...seRates.map((r) => r.price));
    return minPrice / 100;
  }

  // 2. Fall back to Europe-wide rate — Catawiki sometimes lists only a
  //    generic "europe" rate instead of per-country rates.
  const europeRate = rates.find((r) => r.region_code === "europe");
  if (europeRate?.price != null) return europeRate.price / 100;

  return null;
}

// ── category API types ─────────────────────────────────────────────────────

interface CategoryApiLot {
  id: number;
  title: string;
  thumbImageUrl: string | null;
  url: string;
}

interface CategoryApiResponse {
  total: number;
  lots: CategoryApiLot[];
}

// ── lot _next/data types ───────────────────────────────────────────────────

interface BidEntry {
  bidderToken: string;
  localizedBidAmount: number;
}

interface BiddingBlock {
  biddingEndTime: number | null; // Unix ms
  localizedCurrentBidAmount: number | null;
  biddingHistory: { bids: BidEntry[] } | null;
  sold: boolean | null;
}

interface ExpertsEstimate {
  min: { EUR: number };
  max: { EUR: number };
}

interface Specification {
  name: string;
  value: string;
}

interface LotDetailsData {
  lotTitle: string;
  slug: string | null;
  images: Array<{ id?: string }> | null;
  expertsEstimate: ExpertsEstimate | null;
  // Catawiki's sellerInfo can ship under several shapes depending on the
  // page version — country can be at top level or nested under `location`.
  // Read all known paths and let the helper below pick the first hit.
  sellerInfo: {
    sellerName?: string;
    country?: string;
    countryCode?: string;
    countryName?: string;
    location?: {
      country?: string;
      countryCode?: string;
      countryName?: string;
    };
  } | null;
  specifications: Specification[] | null;
}

/**
 * Extract a 2-letter country code (ISO 3166-1 alpha-2) for the seller.
 * Tries each documented field path; returns null if none populated.
 */
function extractSellerCountry(
  sellerInfo: LotDetailsData["sellerInfo"],
): string | null {
  if (!sellerInfo) return null;
  const candidates: Array<string | undefined> = [
    sellerInfo.countryCode,
    sellerInfo.location?.countryCode,
    sellerInfo.country,
    sellerInfo.location?.country,
    sellerInfo.countryName,
    sellerInfo.location?.countryName,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) {
      // Normalise to UPPER-CASE 2-letter code if it already looks like one;
      // otherwise return the trimmed string as-is (e.g. "France").
      const trimmed = c.trim();
      return /^[A-Za-z]{2}$/.test(trimmed) ? trimmed.toUpperCase() : trimmed;
    }
  }
  return null;
}

interface LotPageProps {
  biddingBlockResponse: BiddingBlock | null;
  lotDetailsData: LotDetailsData | null;
}

interface NextDataResponse {
  pageProps?: LotPageProps;
}

function parseLotPageProps(
  pp: LotPageProps,
  catawikiId: string,
  fallbackUrl: string,
  fallbackTitle: string,
  fallbackImageUrl: string | null,
  catawikiCategoryId: number,
  catawikiSubcategoryId: number | null,
): ScrapedLot | null {
  const bid = pp.biddingBlockResponse;
  const ldd = pp.lotDetailsData;

  if (!bid?.biddingEndTime) return null;

  const url = ldd?.slug
    ? `${BASE_URL}/en/l/${ldd.slug}`
    : fallbackUrl;

  const bids = bid.biddingHistory?.bids ?? [];
  const uniqueBidders = new Set(bids.map((b) => b.bidderToken)).size;

  // Count distinct bidding turns: consecutive bids by the same bidder
  // (proxy/probe sequences) are collapsed into one turn.
  let bidTurns = 0;
  for (let i = 0; i < bids.length; i++) {
    if (i === 0 || bids[i].bidderToken !== bids[i - 1].bidderToken) bidTurns++;
  }

  // Determine lot outcome.
  // Catawiki's `sold` flag isn't trustworthy at scrape time: it stays false/null
  // for hours-to-days after the auction ends (until the buyer's payment clears),
  // by which point we've already archived the row. So we also infer "sold" when
  // the winning bid hit or exceeded the low estimate — Catawiki's reserve is
  // (almost always) the low estimate, so a bid ≥ low estimate means the reserve
  // was met and the lot sold.
  const currentBid = bid.localizedCurrentBidAmount ?? null;
  const lowEstimate = ldd?.expertsEstimate?.min?.EUR ?? null;
  const reserveMet = currentBid !== null && lowEstimate !== null && currentBid >= lowEstimate;
  const lot_outcome: LotOutcome =
    bid.sold === true   ? "sold"
    : bids.length === 0 ? "no_bids"
    : reserveMet        ? "sold"
    :                     "not_sold";

  return {
    catawiki_id: catawikiId,
    url,
    title: ldd?.lotTitle ?? fallbackTitle,
    image_url: ldd?.images?.[0]?.id ?? fallbackImageUrl ?? null,
    current_bid: bid.localizedCurrentBidAmount ?? null,
    currency: "EUR",
    estimated_low: ldd?.expertsEstimate?.min?.EUR ?? null,
    estimated_high: ldd?.expertsEstimate?.max?.EUR ?? null,
    bid_count: bidTurns,
    unique_bidders: uniqueBidders,
    lot_outcome,
    ends_at: new Date(bid.biddingEndTime).toISOString(),
    seller: ldd?.sellerInfo?.sellerName ?? null,
    seller_country: extractSellerCountry(ldd?.sellerInfo ?? null),
    catawiki_category_id: catawikiCategoryId,
    catawiki_subcategory_id: catawikiSubcategoryId,
    shipping_cost_eur: null, // populated by scrapeLot after parsing
    specifications: ldd?.specifications?.map((s) => ({ name: s.name, value: s.value })) ?? null,
  };
}

// ── public API ─────────────────────────────────────────────────────────────

// 25 lots/page × 40 = up to 1000 lots per scrape (per category or subcategory).
// Catawiki rarely has more than ~600 active per top-level category at once.
const MAX_PAGES = 40;

export async function scrapeCategoryLotIds(
  categoryId: number,
  subcategoryIds?: number[],
): Promise<Array<{ id: string; url: string; title: string; imageUrl: string | null }>> {
  // Catawiki's `?l2_categories=...` query filter is currently ignored — every
  // matrix job for the same parent category was scraping the same 275 lots,
  // so we never crawled most of the inventory and lost subcategory accuracy
  // to upsert races. Fix: when a single subcategory is given, hit the
  // subcategory's own endpoint (`/categories/{subId}/lots`). Catawiki's
  // category tree is fully addressable that way. We still send the legacy
  // `l2_categories` param in case some endpoints honour it; it's harmless.
  const apiCategoryId =
    subcategoryIds?.length === 1 ? subcategoryIds[0] : categoryId;
  const l2Param = subcategoryIds?.length
    ? `&l2_categories=${subcategoryIds.join(",")}`
    : "";

  const all: Array<{ id: string; url: string; title: string; imageUrl: string | null }> = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE_URL}/buyer/api/v1/categories/${apiCategoryId}/lots?page=${page}${l2Param}`;
    console.log(`[catawiki] category ${apiCategoryId}${l2Param ? ` (l2:${subcategoryIds?.join(",")})` : ""} page ${page}`);

    const data = await fetchJson<CategoryApiResponse>(url);
    if (!data?.lots?.length) {
      console.log(`[catawiki] no lots on page ${page} — stopping`);
      break;
    }

    for (const lot of data.lots) {
      all.push({
        id: String(lot.id),
        url: lot.url ?? `${BASE_URL}/en/l/${lot.id}`,
        title: lot.title,
        imageUrl: lot.thumbImageUrl,
      });
    }
    console.log(`[catawiki] +${data.lots.length} lots (${all.length} total, server total=${data.total})`);

    if (all.length >= data.total) break;
    await sleep(jitter());
  }

  return all;
}

export async function scrapeLot(
  catawikiId: string,
  fallbackUrl: string,
  fallbackTitle: string,
  fallbackImageUrl: string | null,
  catawikiCategoryId: number,
  catawikiSubcategoryId: number | null,
): Promise<ScrapedLot | null> {
  const buildId = await getBuildId();

  let lot: ScrapedLot | null = null;

  if (buildId) {
    // Primary: Next.js _next/data JSON endpoint (JSON, avoids HTML bot-detection)
    const dataUrl = `${BASE_URL}/_next/data/${buildId}/en/l/${catawikiId}.json`;
    const data = await fetchJson<NextDataResponse>(dataUrl, {
      "X-Nextjs-Data": "1",
      Referer: `${BASE_URL}/en/c/${catawikiCategoryId}`,
    });
    if (data?.pageProps) {
      try {
        lot = parseLotPageProps(
          data.pageProps,
          catawikiId,
          fallbackUrl,
          fallbackTitle,
          fallbackImageUrl,
          catawikiCategoryId,
          catawikiSubcategoryId,
        );
      } catch (err) {
        console.error(`[catawiki] parse error for lot ${catawikiId}:`, err);
      }
    }
  }

  if (!lot) {
    // Fallback: fetch HTML page and parse __NEXT_DATA__
    const html = await fetchHtml(`${BASE_URL}/en/l/${catawikiId}`);
    if (!html) return null;

    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;

    try {
      const parsed = JSON.parse(m[1]) as { props?: { pageProps?: LotPageProps } };
      const pp = parsed.props?.pageProps;
      if (!pp) return null;
      lot = parseLotPageProps(
        pp,
        catawikiId,
        fallbackUrl,
        fallbackTitle,
        fallbackImageUrl,
        catawikiCategoryId,
        catawikiSubcategoryId,
      );
    } catch (err) {
      console.error(`[catawiki] HTML parse error for lot ${catawikiId}:`, err);
      return null;
    }
  }

  if (lot) {
    lot.shipping_cost_eur = await fetchShippingCostEur(catawikiId);
  }

  return lot;
}
