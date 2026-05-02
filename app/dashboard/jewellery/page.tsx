/**
 * Jewellery deals dashboard.
 *
 * Same SSR + ListingsBoard pattern as the wine dashboard
 * (app/dashboard/page.tsx). Filters by the `jewellery` vertical.
 * The ListingRow component will render dashes in the wine-specific
 * cells (Vivino / CellarTracker / Systembolaget) — those values are
 * null for non-wine lots, which the existing component handles
 * gracefully.
 */
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { getIdentity, hasLevel, ROLE_LEVEL } from "@/lib/admin/roles";
import { redirect } from "next/navigation";
import type { ClassifiedListing, BucketData, HistoryListing } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import ListingsBoard, { type CategoryDef } from "../listings-board";
import StatusBar from "@/components/status-bar";
import AppHeader from "@/components/app-header";
import { buildNavLinks } from "@/lib/nav-links";
import { enrichJewelleryLastPrices } from "@/lib/jewellery-match";

const VERTICAL = "jewellery";

// Pills shown in the Category row. Diamonds is its own top-level category
// (715); Gold (1660) and Silver (841) are subcategories of Jewellery (313)
// — flatten them by pre-setting subcategoryId so the click maps directly.
const JEWELLERY_CATEGORIES: CategoryDef[] = [
  { id: null, label: "All",      icon: "💎" },
  { id: 715,  label: "Diamonds", icon: "💎" },
  { id: 313,  subcategoryId: 1660, label: "Gold",   icon: "🟡" },
  { id: 313,  subcategoryId: 841,  label: "Silver", icon: "⚪" },
];

export const metadata = { title: "Jewellery – Nimbridge" };

export default async function JewelleryDealsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const identity = await getIdentity(user.id, user.email ?? "");
  if (identity.role === "pending") redirect("/pending");
  if (!hasLevel(identity, ROLE_LEVEL.user)) redirect("/login?error=access");

  // Paginate the active listings + the archive set past Supabase's
  // PostgREST 1 000-row cap. Without this both queries silently truncate.
  type ArchiveRow = Pick<HistoryListing,
    "title" | "catawiki_category_id" | "catawiki_subcategory_id" | "weight_g" | "final_price" | "ends_at"
  >;
  const listingsPromise = fetchAllRows<ClassifiedListing>((from, to) =>
    supabase
      .from("v_classified_listings")
      .select("*")
      .eq("category", VERTICAL)
      .order("ends_at", { ascending: true })
      .range(from, to),
  );
  const archivesPromise = fetchAllRows<ArchiveRow>((from, to) =>
    supabase
      .from("auction_results")
      .select("title, catawiki_category_id, catawiki_subcategory_id, weight_g, final_price, ends_at")
      .eq("category", VERTICAL)
      .order("ends_at", { ascending: false })
      .range(from, to),
  );

  const [
    rawRows, favoritesRes, activeCountRes, lastRunRes, profileRes, settingsRes,
    archives,
  ] = await Promise.all([
      listingsPromise,
      supabase.from("favorites").select("listing_id").eq("user_id", user.id),
      supabase
        .from("v_classified_listings")
        .select("*", { count: "exact", head: true })
        .eq("category", VERTICAL),
      supabase
        .from("scraper_runs")
        .select("ran_at, lots_scraped")
        .order("ran_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("user_settings")
        .select("currency, country_code")
        .eq("user_id", user.id)
        .maybeSingle(),
      archivesPromise,
    ]);

  const favoriteIds = new Set(
    (favoritesRes.data ?? []).map((f) => f.listing_id as string)
  );
  // Override last_auction_price using grade+weight match. Listings with
  // a grade we can't parse keep the view's title-match value.
  const rows = enrichJewelleryLastPrices(rawRows, archives as HistoryListing[]);

  const buckets: BucketData = {
    ending_soon: rows.filter((l) => l.ending_soon_no_bids),
    low_price:   rows.filter((l) => l.price_bucket === "low"),
    good_price:  rows.filter((l) => l.price_bucket === "good"),
    ok_price:    rows.filter((l) => l.price_bucket === "ok"),
    overpriced:  rows.filter((l) => l.overpriced),
    rest:        rows.filter((l) => !l.ending_soon_no_bids && l.price_bucket === null && !l.overpriced),
  };

  const showAdminLink =
    identity.role === "owner" ||
    identity.role === "admin" ||
    identity.role === "moderator";

  const displayName  = profileRes.data?.display_name || undefined;
  const currency     = settingsRes.data?.currency     ?? DEFAULT_SETTINGS.currency;
  const countryCode  = settingsRes.data?.country_code ?? DEFAULT_SETTINGS.country_code;
  const showShipping = countryCode === "se";

  return (
    <div className="min-h-screen bg-neutral-950">
      <AppHeader
        brand="🔭 Nimbridge"
        links={buildNavLinks({ pathname: "/dashboard/jewellery", showAdmin: showAdminLink })}
        email={user.email ?? ""}
        displayName={displayName}
        role={identity.role}
      />
      <StatusBar
        activeListings={activeCountRes.count ?? 0}
        lastRunAt={lastRunRes.data?.ran_at ?? null}
        lastRunScraped={lastRunRes.data?.lots_scraped ?? null}
      />
      <ListingsBoard
        initialBuckets={buckets}
        initialFavoriteIds={[...favoriteIds]}
        currency={currency}
        showShipping={showShipping}
        category={VERTICAL}
        categories={JEWELLERY_CATEGORIES}
      />
    </div>
  );
}
