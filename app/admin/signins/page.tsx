import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";
import RemoveBlockButton from "./remove-block-button";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    year:   "numeric",
    month:  "short",
    day:    "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    month:  "short",
    day:    "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminSigninsPage() {
  const [{ data: signins }, { data: attempts }, { data: ipBlocks }] = await Promise.all([
    supabaseAdmin
      .from("user_signins")
      .select("id, email, display_name, is_new_user, signed_in_at")
      .order("signed_in_at", { ascending: false })
      .limit(200),

    supabaseAdmin
      .from("login_attempts")
      .select("id, ip, username, attempted_at")
      .order("attempted_at", { ascending: false })
      .limit(50),

    supabaseAdmin
      .from("ip_rate_limits")
      .select("ip, fail_count, timeout_count, locked_until, is_permanent, updated_at")
      .or("is_permanent.eq.true,locked_until.not.is.null,fail_count.gt.0")
      .order("updated_at", { ascending: false }),
  ]);

  const rows       = signins  ?? [];
  const failRows   = attempts ?? [];
  const blockRows  = ipBlocks ?? [];
  const newCount   = rows.filter((s) => s.is_new_user).length;

  const permBlocked = blockRows.filter((r) => r.is_permanent);
  const tempLocked  = blockRows.filter(
    (r) => !r.is_permanent && r.locked_until && new Date(r.locked_until) > new Date(),
  );
  const withFails   = blockRows.filter(
    (r) =>
      !r.is_permanent &&
      !(r.locked_until && new Date(r.locked_until) > new Date()) &&
      r.fail_count > 0,
  );

  return (
    <div className="space-y-10">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sign-in history</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Last {rows.length} SSO sign-ins ·{" "}
            <span className="text-orange-400 font-medium">{newCount} new users</span> awaiting approval
          </p>
        </div>
        <Link
          href="/admin/users"
          className="text-sm px-4 py-2 rounded-lg bg-white text-black font-medium hover:bg-neutral-200 transition-colors"
        >
          Manage users →
        </Link>
      </div>

      {/* ── Failed login attempts ───────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">
          Failed login attempts
          {failRows.length > 0 && (
            <span className="ml-2 text-sm font-normal text-red-400">
              {failRows.length} recent
            </span>
          )}
        </h2>

        {failRows.length === 0 ? (
          <div className="flex items-center justify-center h-16 rounded-xl border border-neutral-800 text-neutral-500 text-sm">
            No failed attempts recorded.
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-800 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900 text-neutral-400">
                  <th className="py-2 px-4 font-medium">IP address</th>
                  <th className="py-2 px-4 font-medium">Username tried</th>
                  <th className="py-2 px-4 font-medium text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {failRows.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-neutral-800/50 hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="py-2 px-4 font-mono text-red-400 text-xs">{a.ip}</td>
                    <td className="py-2 px-4 text-neutral-300">{a.username ?? "—"}</td>
                    <td className="py-2 px-4 text-right text-neutral-500 tabular-nums text-xs whitespace-nowrap">
                      {fmtDateShort(a.attempted_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── IP block overview ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">
          IP rate limits &amp; blocks
          {(permBlocked.length + tempLocked.length) > 0 && (
            <span className="ml-2 text-sm font-normal text-orange-400">
              {permBlocked.length} permanent · {tempLocked.length} temp locked
            </span>
          )}
        </h2>

        {blockRows.length === 0 ? (
          <div className="flex items-center justify-center h-16 rounded-xl border border-neutral-800 text-neutral-500 text-sm">
            No IP restrictions active.
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-800 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900 text-neutral-400">
                  <th className="py-2 px-4 font-medium">IP address</th>
                  <th className="py-2 px-4 font-medium text-center">Status</th>
                  <th className="py-2 px-4 font-medium text-center">Fails</th>
                  <th className="py-2 px-4 font-medium text-center">Timeouts</th>
                  <th className="py-2 px-4 font-medium">Locked until</th>
                  <th className="py-2 px-4 font-medium text-right">Last updated</th>
                  <th className="py-2 px-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {[...permBlocked, ...tempLocked, ...withFails].map((r) => {
                  const isTemp = !r.is_permanent && r.locked_until && new Date(r.locked_until) > new Date();
                  return (
                    <tr
                      key={r.ip}
                      className={`border-b border-neutral-800/50 transition-colors ${
                        r.is_permanent
                          ? "bg-red-500/5 hover:bg-red-500/10"
                          : isTemp
                          ? "bg-orange-500/5 hover:bg-orange-500/10"
                          : "hover:bg-neutral-800/40"
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono text-xs text-white">{r.ip}</td>
                      <td className="py-2.5 px-4 text-center">
                        {r.is_permanent ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/30">
                            Permanently blocked
                          </span>
                        ) : isTemp ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-medium border border-orange-500/30">
                            Temp locked
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-500">Active fails</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center tabular-nums text-neutral-300 text-xs">
                        {r.fail_count}
                      </td>
                      <td className="py-2.5 px-4 text-center tabular-nums text-neutral-300 text-xs">
                        {r.timeout_count}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-neutral-400 whitespace-nowrap">
                        {r.locked_until ? fmtDate(r.locked_until) : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-right text-xs text-neutral-500 tabular-nums whitespace-nowrap">
                        {fmtDateShort(r.updated_at)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <RemoveBlockButton ip={r.ip} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── SSO sign-in history ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">SSO sign-in history</h2>

        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-16 rounded-xl border border-neutral-800 text-neutral-500 text-sm">
            No sign-ins recorded yet.
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-800 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900 text-neutral-400">
                  <th className="py-2 px-4 font-medium">Email</th>
                  <th className="py-2 px-4 font-medium">Name</th>
                  <th className="py-2 px-4 font-medium text-center">Status</th>
                  <th className="py-2 px-4 font-medium text-right">Signed in at</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    className={`border-b border-neutral-800/50 transition-colors ${
                      s.is_new_user ? "bg-orange-500/5 hover:bg-orange-500/10" : "hover:bg-neutral-800/40"
                    }`}
                  >
                    <td className="py-2.5 px-4 text-white font-medium">{s.email}</td>
                    <td className="py-2.5 px-4 text-neutral-400">{s.display_name ?? "—"}</td>
                    <td className="py-2.5 px-4 text-center">
                      {s.is_new_user ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-medium border border-orange-500/30">
                          🔔 New user
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-600">Returning</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right text-neutral-400 whitespace-nowrap tabular-nums">
                      {fmtDate(s.signed_in_at)}
                    </td>
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
