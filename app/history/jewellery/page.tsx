/**
 * Jewellery history page — closed auctions for the jewellery vertical.
 * Same shape as app/history/page.tsx, scoped to category='jewellery'.
 */
import { createClient } from "@/lib/supabase/server";
import { getIdentity, hasLevel, ROLE_LEVEL } from "@/lib/admin/roles";
import { redirect } from "next/navigation";
import type { HistoryListing } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import HistoryBoard from "../history-board";
import type { CategoryDef } from "@/app/dashboard/listings-board";
import AppHeader from "@/components/app-header";
import { buildNavLinks } from "@/lib/nav-links";

const VERTICAL = "jewellery";

// Mirrors the Deals jewellery dashboard so History shows the same pill row.
// See app/dashboard/jewellery/page.tsx for ID rationale.
const JEWELLERY_CATEGORIES: CategoryDef[] = [
  { id: null, label: "All",      icon: "💎" },
  { id: 715,  label: "Diamonds", icon: "💎" },
  { id: 313,  subcategoryId: 1660, label: "Gold",   icon: "🟡" },
  { id: 313,  subcategoryId: 841,  label: "Silver", icon: "⚪" },
];

export const metadata = { title: "Jewellery history – Nimbridge" };

export default async function JewelleryHistoryPage() {
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

  const PAGE = 1000;
  const allListings: HistoryListing[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("auction_results")
      .select("*")
      .eq("category", VERTICAL)
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
        links={buildNavLinks({ pathname: "/history/jewellery", showAdmin: showAdminLink })}
        email={user.email ?? ""}
        displayName={displayName}
        role={identity.role}
      />
      <HistoryBoard
        listings={allListings}
        currency={currency}
        showShipping={showShipping}
        vertical={VERTICAL}
        categories={JEWELLERY_CATEGORIES}
      />
    </div>
  );
}
