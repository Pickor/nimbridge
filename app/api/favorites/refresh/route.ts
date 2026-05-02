/**
 * /api/favorites/refresh — on-demand refresh of the user's starred lots.
 *
 *   GET  — re-fetch the user's favorites and return them (after a refresh)
 *   POST — kick off the feed-lots.yml GH workflow targeting just the
 *          user's favorited lot IDs, so they get the freshest bid data
 *
 * The "Refresh" button on /favorites is rate-limited to 1/min via
 * localStorage on the client; this server route enforces no rate limit
 * itself but logs the workflow dispatch for audit.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const GITHUB_REPO     = "Pickor/archive-cwfqwn1-private";
const WORKFLOW_FILE   = "feed-lots.yml";
const GITHUB_REF      = "master";

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(url, key);
}

// ── GET — return the user's current favorited listings ─────────────────────
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: favRows } = await supabase
    .from("favorites")
    .select("listing_id");

  if (!favRows?.length) return NextResponse.json({ listings: [] });

  const listingIds = favRows.map((f) => f.listing_id as string);
  const db = makeAdminClient();

  const { data: listings } = await db
    .from("v_classified_listings")
    .select("*")
    .in("id", listingIds)
    .order("ends_at", { ascending: true });

  return NextResponse.json({ listings: listings ?? [] });
}

// ── POST — dispatch a GitHub Actions workflow to scrape favorited lots ──────
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db  = makeAdminClient();
  const now = new Date().toISOString();

  // ── 1. Get this user's favorite listing IDs ───────────────────────────────
  const { data: favRows } = await supabase
    .from("favorites")
    .select("listing_id");

  if (!favRows?.length) {
    return NextResponse.json({ ok: true, queued: false, reason: "no_favorites" });
  }

  const listingIds = favRows.map((f) => f.listing_id as string);

  // ── 2. Look up catawiki_ids for those listings ────────────────────────────
  const { data: listings } = await db
    .from("listings")
    .select("catawiki_id")
    .in("id", listingIds)
    .eq("is_active", true)
    .gt("ends_at", now);

  if (!listings?.length) {
    return NextResponse.json({ ok: true, queued: false, reason: "no_active_lots" });
  }

  const catawikiIds = listings.map((l) => l.catawiki_id as string).join(",");

  // ── 3. Dispatch the GitHub Actions workflow ───────────────────────────────
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return NextResponse.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 });
  }

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: GITHUB_REF,
        inputs: { catawiki_ids: catawikiIds },
      }),
    },
  );

  if (!dispatchRes.ok) {
    const body = await dispatchRes.text();
    console.error("[refresh] GitHub dispatch failed:", dispatchRes.status, body);
    return NextResponse.json({ error: "Failed to dispatch workflow", detail: body }, { status: 502 });
  }

  // GitHub returns 204 No Content on success
  return NextResponse.json({
    ok: true,
    queued: true,
    lots: listings.length,
    catawikiIds,
  });
}
