import { createClient } from "@/lib/supabase/server";
import { getIdentity, ROLE_LEVEL } from "@/lib/admin/roles";
import { redirect } from "next/navigation";
import type { ClassifiedListing } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import FavoritesBoard from "./favorites-board";
import AppHeader from "@/components/app-header";
import { buildNavLinks } from "@/lib/nav-links";

export default async function FavoritesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [identity, profileRes, favRes, settingsRes] = await Promise.all([
    getIdentity(user.id, user.email ?? ""),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("favorites").select("listing_id").eq("user_id", user.id),
    supabase.from("user_settings").select("currency, country_code").eq("user_id", user.id).maybeSingle(),
  ]);

  if (identity.role === "pending") redirect("/pending");

  const displayName   = profileRes.data?.display_name || undefined;
  const showAdminLink = identity.level >= ROLE_LEVEL.moderator;
  const currency      = settingsRes.data?.currency     ?? DEFAULT_SETTINGS.currency;
  const countryCode   = settingsRes.data?.country_code ?? DEFAULT_SETTINGS.country_code;
  const showShipping  = countryCode === "se";

  const favoriteIds = (favRes.data ?? []).map((f) => f.listing_id as string);

  let listings: ClassifiedListing[] = [];
  if (favoriteIds.length > 0) {
    const { data } = await supabase
      .from("v_classified_listings")
      .select("*")
      .in("id", favoriteIds)
      .order("ends_at", { ascending: true });
    listings = (data ?? []) as ClassifiedListing[];
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <AppHeader
        brand="🔭 Nimbridge"
        links={buildNavLinks({ pathname: "/favorites", showAdmin: showAdminLink })}
        email={user.email ?? ""}
        displayName={displayName}
        role={identity.role}
      />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="text-lg font-semibold text-white mb-6">
          ❤️ Your favorites
        </h2>
        <FavoritesBoard
          initialListings={listings}
          initialFavoriteIds={favoriteIds}
          currency={currency}
          showShipping={showShipping}
        />
      </main>
    </div>
  );
}
