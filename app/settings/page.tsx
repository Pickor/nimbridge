import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppHeader from "@/components/app-header";
import { buildNavLinks } from "@/lib/nav-links";
import { getIdentity, ROLE_LEVEL } from "@/lib/admin/roles";
import { CURRENCIES, CURRENCY_LABELS, COUNTRIES } from "@/lib/currency";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { saveSettings } from "./actions";
import DeleteAccountButton from "./delete-account-button";

export const metadata = { title: "Settings – Nimbridge" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [identity, profileRes, settingsRes] = await Promise.all([
    getIdentity(user.id, user.email ?? ""),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("currency, country_code").eq("user_id", user.id).maybeSingle(),
  ]);

  if (identity.role === "pending") redirect("/pending");

  const displayName  = profileRes.data?.display_name || undefined;
  const currency     = settingsRes.data?.currency     ?? DEFAULT_SETTINGS.currency;
  const country_code = settingsRes.data?.country_code ?? DEFAULT_SETTINGS.country_code;
  const { saved }    = await searchParams;
  const showAdminLink = identity.level >= ROLE_LEVEL.moderator;

  return (
    <div className="min-h-screen bg-neutral-950">
      <AppHeader
        brand="🔭 Nimbridge"
        links={buildNavLinks({ pathname: "/settings", showAdmin: showAdminLink })}
        email={user.email ?? ""}
        displayName={displayName}
        role={identity.role}
      />

      <main className="mx-auto max-w-lg px-4 py-12 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm text-neutral-500 mt-1">Preferences for your account</p>
        </div>

        {saved && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-400">
            Settings saved.
          </div>
        )}

        {/* ── Display preferences ── */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 space-y-6">
          <h2 className="text-base font-semibold text-white">Display preferences</h2>

          <form action={saveSettings} className="space-y-5">

            {/* Currency */}
            <div className="space-y-1.5">
              <label htmlFor="currency" className="block text-xs font-medium text-neutral-400 uppercase tracking-wide">
                Currency
              </label>
              <select
                id="currency"
                name="currency"
                defaultValue={currency}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{CURRENCY_LABELS[c]}</option>
                ))}
              </select>
              <p className="text-xs text-neutral-500">
                Changes the currency column in Deals, History, and Favorites.
              </p>
            </div>

            {/* Country */}
            <div className="space-y-1.5">
              <label htmlFor="country_code" className="block text-xs font-medium text-neutral-400 uppercase tracking-wide">
                Country
              </label>
              <select
                id="country_code"
                name="country_code"
                defaultValue={country_code}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <p className="text-xs text-neutral-500">
                Shipping costs are only available for Sweden. For other countries the shipping column is hidden.
              </p>
            </div>

            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-white text-neutral-900 text-sm font-semibold hover:bg-neutral-200 transition-colors"
            >
              Save settings
            </button>
          </form>
        </div>

        {/* ── Danger zone ── */}
        <div className="rounded-xl border border-red-500/20 bg-neutral-900 p-6 space-y-4">
          <h2 className="text-base font-semibold text-red-400">Danger zone</h2>
          <p className="text-sm text-neutral-400">
            Permanently delete your account and all associated data including favorites and settings.
          </p>
          <DeleteAccountButton />
        </div>
      </main>
    </div>
  );
}
