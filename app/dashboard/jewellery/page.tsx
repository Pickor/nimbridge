/**
 * Placeholder for the Jewellery Deals dashboard.
 *
 * The data plumbing for non-wine categories isn't in place yet — the
 * scraper still only crawls wine/spirits — so this page just confirms
 * the route is wired up and tells the user what's coming.
 *
 * When the scraper is extended, replace the placeholder body with the
 * same SSR + ListingsBoard pattern from app/dashboard/page.tsx,
 * filtering by the jewellery catawiki_category_id.
 */
import { createClient } from "@/lib/supabase/server";
import { getIdentity, hasLevel, ROLE_LEVEL } from "@/lib/admin/roles";
import { redirect } from "next/navigation";
import AppHeader from "@/components/app-header";
import { buildNavLinks } from "@/lib/nav-links";

export const metadata = { title: "Jewellery – Nimbridge" };

export default async function JewelleryDealsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [identity, profileRes] = await Promise.all([
    getIdentity(user.id, user.email ?? ""),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  if (identity.role === "pending") redirect("/pending");
  if (!hasLevel(identity, ROLE_LEVEL.user)) redirect("/login?error=access");

  const showAdminLink =
    identity.role === "owner" || identity.role === "admin" || identity.role === "moderator";

  return (
    <div className="min-h-screen bg-neutral-950">
      <AppHeader
        brand="🔭 Nimbridge"
        links={buildNavLinks({ pathname: "/dashboard/jewellery", showAdmin: showAdminLink })}
        email={user.email ?? ""}
        displayName={profileRes.data?.display_name || undefined}
        role={identity.role}
      />
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="text-5xl mb-6">💎</div>
        <h1 className="text-3xl font-semibold text-white mb-3">Jewellery — Coming soon</h1>
        <p className="text-neutral-400 text-sm leading-relaxed">
          The crawler isn&apos;t configured to pick up Jewellery lots from Catawiki yet.
          This page will mirror the Wine &amp; Spirits dashboard once data is flowing.
        </p>
      </main>
    </div>
  );
}
