import { createClient } from "@/lib/supabase/server";
import { getIdentity, hasLevel, ROLE_LEVEL } from "@/lib/admin/roles";
import { redirect } from "next/navigation";
import type { ClassifiedListing, BucketData } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import ListingsBoard from "./listings-board";
import StatusBar from "@/components/status-bar";
import AppHeader from "@/components/app-header";
import { buildNavLinks } from "@/lib/nav-links";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const identity = await getIdentity(user.id, user.email ?? "");
  if (identity.role === "pending") redirect("/pending");
  if (!hasLevel(identity, ROLE_LEVEL.user)) redirect("/login?error=access");

  const [listingsRes, favoritesRes, activeCountRes, lastRunRes, profileRes, settingsRes] =
    await Promise.all([
      supabase
        .from("v_classified_listings")
        .select("*")
        .eq("category", "wine-whisky-spirits")
        .order("ends_at", { ascending: true })
        .limit(5000),
      supabase.from("favorites").select("listing_id").eq("user_id", user.id),
      supabase
        .from("v_classified_listings")
        .select("*", { count: "exact", head: true })
        .eq("category", "wine-whisky-spirits"),
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
    ]);

  const favoriteIds = new Set(
    (favoritesRes.data ?? []).map((f) => f.listing_id as string)
  );
  const rows = (listingsRes.data ?? []) as ClassifiedListing[];

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

  const displayName   = profileRes.data?.display_name || undefined;
  const currency      = settingsRes.data?.currency     ?? DEFAULT_SETTINGS.currency;
  const countryCode   = settingsRes.data?.country_code ?? DEFAULT_SETTINGS.country_code;
  const showShipping  = countryCode === "se";

  return (
    <div className="min-h-screen bg-neutral-950">
      <AppHeader
        brand="🔭 Nimbridge"
        links={buildNavLinks({ pathname: "/dashboard", showAdmin: showAdminLink })}
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
      />
    </div>
  );
}
