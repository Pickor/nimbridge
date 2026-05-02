/**
 * GET /auth/callback — Google OAuth completion endpoint.
 *
 * Supabase redirects here with `?code=...` after the user signs in.
 * We:
 *   1. Exchange the code for a session (sets the supabase auth cookie)
 *   2. Look up the user's role from user_roles
 *   3. Record the sign-in in user_signins (admin notification)
 *   4. Redirect to /pending if the user is new/unapproved, otherwise to ?next= (defaults to /dashboard)
 */
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/dashboard";
  // Block open-redirect: only allow same-origin paths (no protocol-relative `//evil.com`)
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const userId = data.user.id;
      const email  = data.user.email ?? "";
      const displayName = (data.user.user_metadata?.full_name as string | undefined) ?? null;

      // Check if user already has a role assigned
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      // Treat both "no row" and role='pending' as not yet approved
      const isPending = !roleRow || roleRow.role === "pending";

      // Record the sign-in for admin notification history
      await supabaseAdmin.from("user_signins").insert({
        user_id:      userId,
        email,
        display_name: displayName,
        is_new_user:  isPending,
      });

      // Unapproved users go to the pending approval page
      if (isPending) {
        return NextResponse.redirect(new URL("/pending", url.origin));
      }

      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
