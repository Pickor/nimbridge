/**
 * POST /api/admin/roles — change another user's role.
 *
 * Body: { userId, role }. Used by the role <select> on /admin/users.
 *
 * Guard rails:
 *   - Caller must be admin level
 *   - Cannot promote another user to a role at-or-above the caller's level
 *   - Cannot modify the OWNER (env-derived, can't be demoted by anyone)
 */
import { createClient } from "@/lib/supabase/server";
import { getIdentity, hasLevel, ROLE_LEVEL, OWNER_EMAIL } from "@/lib/admin/roles";
import { supabaseAdmin } from "@/lib/supabase/admin";

const VALID_ROLES = ["admin", "moderator", "user"] as const;
type AssignableRole = (typeof VALID_ROLES)[number];

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const identity = await getIdentity(user.id, user.email ?? "");
  if (!hasLevel(identity, ROLE_LEVEL.admin)) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = (await request.json()) as { userId: string; role: string };
  const { userId, role } = body;

  if (!userId || !VALID_ROLES.includes(role as AssignableRole)) {
    return new Response("Bad Request", { status: 400 });
  }

  const newLevel = ROLE_LEVEL[role as AssignableRole];
  if (newLevel >= identity.level) {
    return new Response("Cannot assign role at or above your own level", { status: 403 });
  }

  // Can't modify the owner
  const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (targetUser?.user?.email === OWNER_EMAIL) {
    return new Response("Cannot modify owner", { status: 403 });
  }

  const { error } = await supabaseAdmin.from("user_roles").upsert(
    { user_id: userId, role, granted_by: user.id },
    { onConflict: "user_id" }
  );

  if (error) return new Response("DB error", { status: 500 });
  return Response.json({ ok: true });
}
