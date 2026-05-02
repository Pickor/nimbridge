import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";

// Always re-fetch counts on every request (no static cache)
export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminStatsPage() {
  const [activeRes, historyRes, runsRes, userCountRes, pendingSigninsRes] = await Promise.all([
    supabaseAdmin
      .from("v_classified_listings")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("auction_results")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("scraper_runs")
      .select("id, ran_at, lots_found, lots_scraped, lots_skipped, lots_marked_inactive, duration_ms")
      .order("ran_at", { ascending: false })
      .limit(20),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("user_signins")
      .select("id, email, display_name, is_new_user, signed_in_at")
      .eq("is_new_user", true)
      .order("signed_in_at", { ascending: false })
      .limit(10),
  ]);

  const activeListings  = activeRes.count  ?? 0;
  const historyListings = historyRes.count ?? 0;
  const userCount       = userCountRes.count ?? 0;
  const runs            = runsRes.data ?? [];
  const lastRun         = runs[0] ?? null;
  const pendingSignins  = pendingSigninsRes.data ?? [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Overview</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Active listings"  value={String(activeListings)}  />
        <StatCard label="History listings" value={String(historyListings)} accent />
        <StatCard label="Total users"      value={String(userCount)}       />
        <StatCard
          label="Last scraper run"
          value={lastRun ? fmtDate(lastRun.ran_at) : "Never"}
        />
      </div>

      {/* Pending new users */}
      {pendingSignins.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              🔔 New sign-ins awaiting approval
              <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-medium border border-orange-500/30">
                {pendingSignins.length}
              </span>
            </h2>
            <Link
              href="/admin/signins"
              className="text-xs text-neutral-400 hover:text-white transition-colors"
            >
              View all sign-ins →
            </Link>
          </div>
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 divide-y divide-neutral-800">
            {pendingSignins.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-white font-medium">{s.email}</p>
                  {s.display_name && (
                    <p className="text-xs text-neutral-400">{s.display_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-neutral-500">{fmtDate(s.signed_in_at)}</span>
                  <Link
                    href="/admin/users"
                    className="text-xs px-2.5 py-1 rounded-lg bg-white text-black font-medium hover:bg-neutral-200 transition-colors"
                  >
                    Approve →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent scraper runs */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">
          Recent scraper runs
        </h2>
        {runs.length === 0 ? (
          <p className="text-neutral-500 text-sm">No scraper runs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400">
                  <th className="py-2 pr-4 font-medium">Ran at</th>
                  <th className="py-2 pr-4 font-medium">Found</th>
                  <th className="py-2 pr-4 font-medium">Scraped</th>
                  <th className="py-2 pr-4 font-medium">Skipped</th>
                  <th className="py-2 pr-4 font-medium">Marked inactive</th>
                  <th className="py-2 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-neutral-800/50 text-neutral-300"
                  >
                    <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(r.ran_at)}</td>
                    <td className="py-2 pr-4">{r.lots_found}</td>
                    <td className="py-2 pr-4">{r.lots_scraped}</td>
                    <td className="py-2 pr-4 text-red-400">{r.lots_skipped}</td>
                    <td className="py-2 pr-4">{r.lots_marked_inactive}</td>
                    <td className="py-2">{fmtDuration(r.duration_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-6 py-5 ${accent ? "border-blue-500/30 bg-blue-500/5" : "border-neutral-800 bg-neutral-900"}`}>
      <p className={`text-sm mb-1 ${accent ? "text-blue-400" : "text-neutral-400"}`}>{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}
