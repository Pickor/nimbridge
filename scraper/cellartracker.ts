/**
 * CellarTracker score lookup via CDP-attached, manually-logged-in Chrome.
 *
 * Why this is local-only:
 *   CellarTracker sits behind AWS WAF — server-side fetches and headless
 *   browsers all get hard-blocked at the search endpoint, even with stealth
 *   plugins, residential IPs, and full browser fingerprints. The only
 *   approach that works is attaching to a real, manually-logged-in Chrome.
 *
 * Setup (the user does this once):
 *   1. Close all Chrome windows.
 *   2. Run:
 *        & "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" `
 *           --remote-debugging-port=9222 `
 *           --user-data-dir="$env:TEMP\\ct-chrome-profile"
 *   3. Sign in to https://www.cellartracker.com/ in that Chrome.
 *   4. Minimise the window — leave it running.
 *
 * The backfill script connects via Playwright's CDP transport.
 */
import { chromium, type Browser, type Page } from "playwright";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanTitleForVivino } from "./vivino";

// CellarTracker covers wines, champagne and port — same set Vivino covers.
export const CT_CATEGORIES = new Set<number>([443, 961, 971]);

const CDP_URL = "http://localhost:9222";

/** Strip diacritics — CellarTracker's classic-ASP search mishandles UTF-8 in URLs. */
function ascii(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Re-uses the Vivino title cleaner (same noise: bottle counts, parens,
 * hyphenated regions, commas), strips a few extra Catawiki-specific
 * bottle-format patterns ("N Half Bottles", "N Magnums"…), then strips
 * diacritics so CT's classic-ASP search handles the URL correctly.
 */
export function cleanTitleForCellarTracker(title: string): string {
  return ascii(
    cleanTitleForVivino(title)
      .replace(/\b\d+\s*half\s*bottles?\b/gi, "")
      .replace(/\b\d+\s*demi(?:-|\s+)bottles?\b/gi, "")
      .replace(/\b\d+\s*(?:magnums?|jeroboams?|methuselahs?|salmanazars?|nebuchadnezzars?)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim(),
  );
}

export interface CellarTrackerSession {
  browser: Browser;
  page:    Page;
  close:   () => Promise<void>;
}

// ── Persistent cache helpers ──────────────────────────────────────────────
// One row per cleaned title. score=null is a tombstone: "we searched and
// CT had no match" — saves repeating dead-end queries forever.

/**
 * Read a previously-cached score for a cleaned title.
 *
 * Returns:
 *   - { hit: true, score: number }  — cached, real score
 *   - { hit: true, score: null }    — cached as no-match (don't re-search)
 *   - { hit: false }                — never searched, caller should look up
 */
export async function getCachedCellarTrackerScore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  cleanedTitle: string,
): Promise<{ hit: true; score: number | null } | { hit: false }> {
  const { data, error } = await db
    .from("cellartracker_searches")
    .select("score")
    .eq("cleaned_title", cleanedTitle)
    .maybeSingle();
  if (error || !data) return { hit: false };
  return { hit: true, score: (data.score as number | null) ?? null };
}

/** Persist a search outcome (real score OR no-match) into the cache. */
export async function cacheCellarTrackerScore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  cleanedTitle: string,
  score: number | null,
): Promise<void> {
  await db
    .from("cellartracker_searches")
    .upsert(
      { cleaned_title: cleanedTitle, score, searched_at: new Date().toISOString() },
      { onConflict: "cleaned_title" },
    );
}

/**
 * Attach to the user's logged-in Chrome on localhost:9222. Throws if Chrome
 * isn't running with --remote-debugging-port=9222 or if no logged-in
 * CellarTracker session is detected.
 */
export async function openCellarTrackerSession(): Promise<CellarTrackerSession> {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0] ?? await browser.newContext();
  const page = ctx.pages()[0] ?? await ctx.newPage();

  // Bootstrap: visit homepage so we have a clean tab and can verify the
  // logged-in cookie is present.
  await page.goto("https://www.cellartracker.com/", { waitUntil: "domcontentloaded" });
  const signedOut = await page.locator("a:has-text('Sign In')").count();
  if (signedOut > 0) {
    await browser.close().catch(() => {});
    throw new Error("CellarTracker session is not logged in — sign in manually in the debug Chrome and retry.");
  }

  return {
    browser,
    page,
    close: async () => { await browser.close().catch(() => {}); },
  };
}

/**
 * Search CellarTracker for a single lot title and return the top-result
 * community score (0–100, typically 80–96), or null if no result.
 *
 * Caller is responsible for inserting a polite delay between calls.
 */
export async function lookupCellarTrackerScore(
  page: Page,
  rawTitle: string,
): Promise<number | null> {
  const cleaned = cleanTitleForCellarTracker(rawTitle);
  if (!cleaned) return null;

  const url = "https://www.cellartracker.com/search.asp?S=" + encodeURIComponent(cleaned);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  } catch {
    return null;
  }

  // Hard-block: WAF intercepted us — caller can decide whether to abort.
  const html = await page.content().catch(() => "");
  if (/Human Verification|ERROR: The request could not be satisfied|challenge-container/i.test(html)) {
    throw new Error("CellarTracker WAF block detected — likely rate-limited.");
  }

  // CT result rows include "X.X points 99% like it (N votes)" when enough
  // people have rated the wine. Many rows (recent vintages, obscure
  // variants) have no score at all. So scan ALL result rows and take the
  // first one that has a score — that's the most relevant rated wine.
  const score = await page.evaluate(() => {
    // Result rows are <tr>s containing a link to wine.asp.
    const rows = [...document.querySelectorAll("tr")].filter((tr) =>
      tr.querySelector("a[href*='wine.asp?iWine=']"),
    );
    for (const row of rows) {
      const m = (row.textContent ?? "").match(/(\d{2,3}(?:\.\d+)?)\s*points/i);
      if (!m) continue;
      const n = parseFloat(m[1]);
      if (n < 50 || n > 100) continue;
      return n;
    }
    return null;
  });

  return score;
}
