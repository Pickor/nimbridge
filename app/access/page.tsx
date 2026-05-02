import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const FAIL_THRESHOLD    = 6;                  // wrong attempts before timeout
const TIMEOUT_MS        = 5 * 60 * 1000;     // 5-minute timeout
const PERM_BLOCK_AFTER  = 2;                  // timeouts before permanent block

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mins?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const { error, mins } = await searchParams;

  async function signIn(formData: FormData) {
    "use server";

    // ── Identify caller IP ────────────────────────────────────────────────
    const hdrs = await headers();
    const ip =
      hdrs.get("x-forwarded-for")?.split(",")[0].trim() ??
      hdrs.get("x-real-ip") ??
      "unknown";

    const username = ((formData.get("username") as string) ?? "").trim().toLowerCase();
    const password  = (formData.get("password")  as string) ?? "";

    if (!username || !password) redirect("/access?error=missing");

    // ── Rate-limit check ──────────────────────────────────────────────────
    const { data: rl } = await supabaseAdmin
      .from("ip_rate_limits")
      .select("*")
      .eq("ip", ip)
      .maybeSingle();

    if (rl?.is_permanent) redirect("/access?error=blocked");

    if (rl?.locked_until && new Date(rl.locked_until) > new Date()) {
      const minsLeft = Math.max(
        1,
        Math.ceil((new Date(rl.locked_until).getTime() - Date.now()) / 60_000),
      );
      redirect(`/access?error=locked&mins=${minsLeft}`);
    }

    // ── Attempt authentication ────────────────────────────────────────────
    const email  = `${username}@nimbridge.local`;
    const client = await createClient();
    const { error: authErr } = await client.auth.signInWithPassword({ email, password });

    if (authErr) {
      // Log the attempt regardless
      await supabaseAdmin.from("login_attempts").insert({ ip, username });

      // If the previous timeout has since expired, start a fresh fail window
      const isExpiredTimeout =
        rl?.locked_until && new Date(rl.locked_until) <= new Date();
      const prevFails    = isExpiredTimeout ? 0 : (rl?.fail_count  ?? 0);
      const timeoutCount = rl?.timeout_count ?? 0;
      const newFails     = prevFails + 1;

      let lockedUntil:    string | null = null;
      let isPermanent                   = false;
      let newTimeoutCount               = timeoutCount;
      let storedFails                   = newFails;

      if (newFails >= FAIL_THRESHOLD) {
        newTimeoutCount = timeoutCount + 1;
        storedFails     = 0; // reset window counter

        if (newTimeoutCount >= PERM_BLOCK_AFTER) {
          isPermanent = true;
        } else {
          lockedUntil = new Date(Date.now() + TIMEOUT_MS).toISOString();
        }
      }

      await supabaseAdmin.from("ip_rate_limits").upsert(
        {
          ip,
          fail_count:    storedFails,
          timeout_count: newTimeoutCount,
          locked_until:  lockedUntil,
          is_permanent:  isPermanent,
          updated_at:    new Date().toISOString(),
        },
        { onConflict: "ip" },
      );

      if (isPermanent)         redirect("/access?error=blocked");
      if (newFails >= FAIL_THRESHOLD) redirect("/access?error=locked&mins=5");
      redirect("/access?error=invalid");
    }

    // ── Success: reset fail counter ───────────────────────────────────────
    if (rl) {
      await supabaseAdmin
        .from("ip_rate_limits")
        .update({ fail_count: 0, updated_at: new Date().toISOString() })
        .eq("ip", ip);
    }

    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-neutral-800 bg-neutral-900 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">🔭 Nimbridge</h1>
          <p className="mt-1 text-sm text-neutral-400">Staff access</p>
        </div>

        <form action={signIn} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="username"
              className="block text-xs font-medium text-neutral-400 uppercase tracking-wide"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
              placeholder="your username"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="password"
              className="block text-xs font-medium text-neutral-400 uppercase tracking-wide"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {error === "blocked" && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2.5">
              <p className="text-xs text-red-400 font-medium">Access denied</p>
              <p className="text-xs text-red-400/80 mt-0.5">
                This IP has been permanently blocked. Contact an administrator.
              </p>
            </div>
          )}
          {error === "locked" && (
            <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 px-3 py-2.5">
              <p className="text-xs text-orange-400 font-medium">Too many failed attempts</p>
              <p className="text-xs text-orange-400/80 mt-0.5">
                Try again in {mins ?? "5"} minute{mins !== "1" ? "s" : ""}.
              </p>
            </div>
          )}
          {error === "invalid" && (
            <p className="text-xs text-red-400">Invalid username or password.</p>
          )}
          {error === "missing" && (
            <p className="text-xs text-red-400">Please fill in all fields.</p>
          )}

          <button
            type="submit"
            disabled={error === "blocked"}
            className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
