/**
 * GET /api/stream — Server-Sent Events feed for the live dashboard.
 *
 * Polls v_classified_listings every ~60s and pushes the bucketed result
 * down a long-lived `text/event-stream` response. A 30s heartbeat keeps
 * the connection from being closed by intermediate proxies.
 *
 * The dashboard subscribes via EventSource. If the connection drops
 * (Vercel Hobby's 60s function cap, network blip, etc.) the client
 * auto-reconnects within ~3s and re-renders from the next event.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/paginate";
import type { ClassifiedListing, BucketData, HistoryListing } from "@/lib/types";
import { enrichJewelleryLastPrices } from "@/lib/jewellery-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Pro supports up to 800s; Hobby is capped at 60s (client auto-reconnects)
export const maxDuration = 300;

function toBuckets(rows: ClassifiedListing[]): BucketData {
  return {
    ending_soon: rows.filter((l) => l.ending_soon_no_bids),
    low_price:   rows.filter((l) => l.price_bucket === "low"),
    good_price:  rows.filter((l) => l.price_bucket === "good"),
    ok_price:    rows.filter((l) => l.price_bucket === "ok"),
    overpriced:  rows.filter((l) => l.overpriced),
    rest:        rows.filter((l) => !l.ending_soon_no_bids && l.price_bucket === null && !l.overpriced),
  };
}

// Verticals the SSE feed knows about. Default is wine if `?category=` is
// missing — preserves the original /api/stream behaviour the wine dashboard
// used before multi-vertical support.
const ALLOWED_CATEGORIES = new Set([
  "wine-whisky-spirits",
  "jewellery",
  "watches",
  "apple",
]);

async function fetchListings(category: string): Promise<ClassifiedListing[]> {
  // Paginate past PostgREST's db-max-rows (1 000). `.limit(5000)` silently
  // capped at 1 000 — `fetchAllRows` loops `.range()` until exhausted.
  const rows = await fetchAllRows<ClassifiedListing>((from, to) =>
    supabaseAdmin
      .from("v_classified_listings")
      .select("*")
      .eq("category", category)
      .order("ends_at", { ascending: true })
      .range(from, to),
  );

  // Jewellery dashboards override the view's title-match last_auction_price
  // with a grade+weight match. The archive set is small (~250 rows) so
  // pulling it on every poll is cheap.
  if (category === "jewellery") {
    type ArchiveRow = Pick<HistoryListing,
      "title" | "catawiki_category_id" | "catawiki_subcategory_id" | "weight_g" | "final_price" | "ends_at"
    >;
    const archives = await fetchAllRows<ArchiveRow>((from, to) =>
      supabaseAdmin
        .from("auction_results")
        .select("title, catawiki_category_id, catawiki_subcategory_id, weight_g, final_price, ends_at")
        .eq("category", "jewellery")
        .order("ends_at", { ascending: false })
        .range(from, to),
    );
    return enrichJewelleryLastPrices(rows, archives as HistoryListing[]);
  }
  return rows;
}

export async function GET(request: Request) {
  // Authenticate using the session cookie
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const requested = url.searchParams.get("category") ?? "wine-whisky-spirits";
  const category = ALLOWED_CATEGORIES.has(requested) ? requested : "wine-whisky-spirits";

  const signal = request.signal;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (chunk: string) =>
        controller.enqueue(encoder.encode(chunk));

      const sendEvent = (event: string, data: string) =>
        enqueue(`event: ${event}\ndata: ${data}\n\n`);

      const sendHeartbeat = () => enqueue(": heartbeat\n\n");

      let lastPayload = "";

      // Send initial snapshot immediately
      const initial = await fetchListings(category);
      const initialBuckets = toBuckets(initial);
      lastPayload = JSON.stringify(initialBuckets);
      sendEvent("snapshot", lastPayload);

      const heartbeatTimer = setInterval(() => {
        if (signal.aborted) return;
        sendHeartbeat();
      }, 30_000);

      const pollTimer = setInterval(async () => {
        if (signal.aborted) return;
        try {
          const listings = await fetchListings(category);
          const payload = JSON.stringify(toBuckets(listings));
          if (payload !== lastPayload) {
            lastPayload = payload;
            sendEvent("snapshot", payload);
          }
        } catch (err) {
          console.error("[SSE] poll error:", err);
        }
      }, 60_000);

      signal.addEventListener("abort", () => {
        clearInterval(heartbeatTimer);
        clearInterval(pollTimer);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
