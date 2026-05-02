/**
 * /api/admin/users — admin user-management endpoints.
 *
 *   GET    — list all auth users (paginated to 500) joined with roles + bans
 *   PATCH  — toggle the is_banned flag on a user's profile
 *   DELETE — permanently remove a user from auth + cascade their data
 *
 * All require admin level. Cannot ban/delete the OWNER. Privilege checks
 * mirror /api/admin/roles to keep the rules consistent.
 */
import { createClient } from "@/lib/supabase/server";
import { getIdentity, hasLevel, ROLE_LEVEL, OWNER_EMAIL } from "@/lib/admin/roles";
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

  const { data: authData } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });
  const authUsers = authData?.users ?? [];

  const [{ data: roles }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("user_id, role"),
    supabaseAdmin
      .from("profiles")
      .select("id, display_name, is_banned, created_at"),
  ]);

  const roleMap = new Map(
    (roles ?? []).map((r) => [r.user_id as string, r.role as string])
  );
  const profileMap = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      p as { id: string; display_name: string; is_banned: boolean; created_at: string },
    ])
  );

  const result = authUsers.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    role: u.email === OWNER_EMAIL ? "owner" : (roleMap.get(u.id) ?? "user"),
    display_name: profileMap.get(u.id)?.display_name ?? "",
    is_banned: profileMap.get(u.id)?.is_banned ?? false,
    created_at: u.created_at,
  }));

  return Response.json(result);
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const identity = await getIdentity(user.id, user.email ?? "");
  if (!hasLevel(identity, ROLE_LEVEL.admin)) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = (await request.json()) as { userId: string; isBanned: boolean };
  const { userId, isBanned } = body;
  if (!userId || typeof isBanned !== "boolean") {
    return new Response("Bad Request", { status: 400 });
  }

  // Can't ban the owner
  const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (targetUser?.user?.email === OWNER_EMAIL) {
    return new Response("Cannot modify owner", { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ is_banned: isBanned })
    .eq("id", userId);

  if (error) return new Response("DB error", { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const identity = await getIdentity(user.id, user.email ?? "");
  if (!hasLevel(identity, ROLE_LEVEL.admin)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return new Response("Bad Request", { status: 400 });

  // Fetch target user to enforce role restrictions
  const { data: targetUserData } = await supabaseAdmin.auth.admin.getUserById(userId);
  const targetEmail = targetUserData?.user?.email ?? "";

  // Owner email is always protected
  if (targetEmail === OWNER_EMAIL) {
    return new Response("Cannot delete owner", { status: 403 });
  }

  // Admins cannot delete other admins — only users/moderators
  if (identity.role !== "owner") {
    const targetRoleRow = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    const targetRole = (targetRoleRow.data?.role ?? "user") as string;
    if (targetRole === "admin" || targetRole === "owner") {
      return new Response("Admins cannot delete other admins", { status: 403 });
    }
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ ok: true });
}
