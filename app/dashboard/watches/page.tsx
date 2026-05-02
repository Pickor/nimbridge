/**
 * Placeholder for the Watches Deals dashboard.
 * See app/dashboard/jewellery/page.tsx for the rationale.
 */
import { createClient } from "@/lib/supabase/server";
import { getIdentity, hasLevel, ROLE_LEVEL } from "@/lib/admin/roles";
import { redirect } from "next/navigation";
import AppHeader from "@/components/app-header";
import { buildNavLinks } from "@/lib/nav-links";

export const metadata = { title: "Watches – Nimbridge" };

export default async function WatchesDealsPage() {
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
        links={buildNavLinks({ pathname: "/dashboard/watches", showAdmin: showAdminLink })}
        email={user.email ?? ""}
        displayName={profileRes.data?.display_name || undefined}
        role={identity.role}
      />
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="text-5xl mb-6">⌚</div>
        <h1 className="text-3xl font-semibold text-white mb-3">Watches — Coming soon</h1>
        <p className="text-neutral-400 text-sm leading-relaxed">
          The crawler isn&apos;t configured to pick up Watches lots from Catawiki yet.
          This page will mirror the Wine &amp; Spirits dashboard once data is flowing.
        </p>
      </main>
    </div>
  );
}
