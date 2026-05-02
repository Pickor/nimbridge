/**
 * GET /api/admin/stats — admin/moderator dashboard stats counts.
 * Returns active vs history listing counts, total users, last scraper run.
 * Powers the StatCards on /admin.
 */
import { createClient } from "@/lib/supabase/server";
import { getIdentity, hasLevel, ROLE_LEVEL } from "@/lib/admin/roles";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const identity = await getIdentity(user.id, user.email ?? "");
  if (!hasLevel(identity, ROLE_LEVEL.moderator)) {
    return new Response("Forbidden", { status: 403 });
  }

  const [activeRes, runsRes, userCountRes] = await Promise.all([
    supabaseAdmin
      .from("v_classified_listings")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("scraper_runs")
      .select("ran_at, lots_scraped, lots_found, lots_skipped, duration_ms")
      .order("ran_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true }),
  ]);

  return Response.json({
    activeListings: activeRes.count ?? 0,
    recentRuns: runsRes.data ?? [],
    userCount: userCountRes.count ?? 0,
  });
}
