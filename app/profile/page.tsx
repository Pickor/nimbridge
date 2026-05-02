import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppHeader from "@/components/app-header";
import { buildNavLinks } from "@/lib/nav-links";
import { getIdentity, ROLE_LEVEL } from "@/lib/admin/roles";
import { updateDisplayName } from "./actions";

export const metadata = { title: "Profile – Nimbridge" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [identity, profileRes] = await Promise.all([
    getIdentity(user.id, user.email ?? ""),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);

  if (identity.role === "pending") redirect("/pending");

  const displayName = profileRes.data?.display_name ?? "";
  const { saved, error } = await searchParams;
  const showAdminLink = identity.level >= ROLE_LEVEL.moderator;

  return (
    <div className="min-h-screen bg-neutral-950">
      <AppHeader
        brand="🔭 Nimbridge"
        links={buildNavLinks({ pathname: "/profile", showAdmin: showAdminLink })}
        email={user.email ?? ""}
        displayName={displayName || undefined}
        role={identity.role}
      />

      <main className="mx-auto max-w-lg px-4 py-12 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage your display name</p>
        </div>

        {saved && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-400">
            Display name updated.
          </div>
        )}
        {error === "empty" && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            Display name cannot be empty.
          </div>
        )}

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 space-y-5">

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-neutral-700 flex items-center justify-center text-2xl font-bold text-white shrink-0">
              {(displayName || user.email || "?")[0].toUpperCase()}
            </div>
            <div>
              <p className="text-white font-medium">{displayName || user.email}</p>
              <p className="text-xs text-neutral-500 mt-0.5">{identity.role}</p>
            </div>
          </div>

          {/* Display name form */}
          <form action={updateDisplayName} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="display_name" className="block text-xs font-medium text-neutral-400 uppercase tracking-wide">
                Display name
              </label>
              <input
                id="display_name"
                name="display_name"
                type="text"
                defaultValue={displayName}
                required
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
                placeholder="Your name"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wide">
                Email
              </label>
              <div className="w-full rounded-lg border border-neutral-800 bg-neutral-800/50 px-3 py-2 text-sm text-neutral-400 flex items-center justify-between">
                <span>{user.email}</span>
                <span className="text-xs text-neutral-600 ml-2 shrink-0">Managed by Google</span>
              </div>
            </div>

            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-white text-neutral-900 text-sm font-semibold hover:bg-neutral-200 transition-colors"
            >
              Save changes
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
