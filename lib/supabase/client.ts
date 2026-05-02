/**
 * Supabase client for BROWSER ("use client") components.
 *
 * Uses the anon key, so RLS policies see the user's session via the
 * supabase-js cookie/localStorage handshake. Used by Client Components
 * that need to query/mutate while the user is interacting with the page.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
