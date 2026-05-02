/**
 * Edge middleware — runs before every matched request.
 *
 * Two responsibilities:
 *   1. Refresh the Supabase auth cookie on each request (keeps long-lived
 *      sessions valid even when the user is browsing without auth API calls).
 *   2. Coarse-grained gate: redirect signed-out users away from /dashboard,
 *      /favorites and /admin to /login. Fine-grained role checks (pending,
 *      banned, moderator-only) happen in the page/layout server components.
 *
 * The `matcher` at the bottom restricts execution to those four URL trees,
 * so most requests skip middleware entirely.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;

  // Auth-only protected routes — role checks are done in the page/layout
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/favorites") ||
    pathname.startsWith("/admin");

  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/favorites/:path*", "/admin/:path*", "/login"],
};
