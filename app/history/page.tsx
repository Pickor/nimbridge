import { createClient } from "@/lib/supabase/server";
import { getIdentity, hasLevel, ROLE_LEVEL } from "@/lib/admin/roles";
import { redirect } from "next/navigation";
import type { HistoryListing } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import HistoryBoard from "./history-board";
import AppHeader from "@/components/app-header";
import { buildNavLinks } from "@/lib/nav-links";

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [identity, profileRes, settingsRes] = await Promise.all([
    getIdentity(user.id, user.email ?? ""),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("currency, country_code").eq("user_id", user.id).maybeSingle(),
  ]);

  if (identity.role === "pending") redirect("/pending");
  if (!hasLevel(identity, ROLE_LEVEL.user)) redirect("/login?error=access");

  // Paginate past Supabase's 1 000-row default limit
  // Use select("*") so new columns (e.g. vivino_rating_avg) appear automatically
  // once the database migration is applied — no code change needed.
  const PAGE = 1000;
  const allListings: HistoryListing[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("auction_results")
      .select("*")
      .eq("category", "wine-whisky-spirits")
      .order("ends_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    allListings.push(...(data as HistoryListing[]));
    if (data.length < PAGE) break;
  }

  const displayName   = profileRes.data?.display_name || undefined;
  const showAdminLink = identity.role === "owner" || identity.role === "admin" || identity.role === "moderator";
  const currency      = settingsRes.data?.currency     ?? DEFAULT_SETTINGS.currency;
  const countryCode   = settingsRes.data?.country_code ?? DEFAULT_SETTINGS.country_code;
  const showShipping  = countryCode === "se";

  return (
    <div className="min-h-screen bg-neutral-950">
      <AppHeader
        brand="🔭 Nimbridge"
        links={buildNavLinks({ pathname: "/history", showAdmin: showAdminLink })}
        email={user.email ?? ""}
        displayName={displayName}
        role={identity.role}
      />
      <HistoryBoard listings={allListings} currency={currency} showShipping={showShipping} />
    </div>
  );
}
