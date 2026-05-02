/**
 * GET /api/admin/me — returns the caller's resolved Identity (id, email,
 * role, level, banned). Used by client components that need to know the
 * user's role without a server-component refresh.
 */
import { createClient } from "@/lib/supabase/server";
import { getIdentity } from "@/lib/admin/roles";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const identity = await getIdentity(user.id, user.email ?? "");
  return Response.json(identity);
}
