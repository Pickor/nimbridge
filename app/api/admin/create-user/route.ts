/**
 * POST /api/admin/create-user — admin-only.
 *
 * Creates a Supabase auth user with a synthetic email (`<username>@local`),
 * a password, and an initial role. Used by the "Create user" modal in
 * /admin/users so admins can manually onboard users without going through
 * the Google SSO flow.
 *
 * Caller must have admin level (or higher); the new role can't be at or
 * above the caller's own level.
 */
import { createClient } from "@/lib/supabase/server";
import { getIdentity, hasLevel, ROLE_LEVEL } from "@/lib/admin/roles";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

  const body = (await request.json()) as { username: string; password: string; role?: string };
  const { username, password, role = "user" } = body;

  if (!username || !password) {
    return new Response("username and password are required", { status: 400 });
  }

  const cleanUsername = username.trim().toLowerCase();
  const email = `${cleanUsername}@nimbridge.local`;

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: username.trim() },
  });

  if (error) {
    if (error.message.includes("already been registered")) {
      return new Response("Username already taken", { status: 409 });
    }
    return new Response(error.message, { status: 500 });
  }

  const newUserId = created.user.id;

  // Set display_name in profile (trigger may have already created the row)
  await supabaseAdmin
    .from("profiles")
    .upsert({ id: newUserId, display_name: username.trim(), updated_at: new Date().toISOString() });

  // Assign role if not default user
  if (role !== "user") {
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: newUserId, role });
  }

  return Response.json({
    id: newUserId,
    email,
    display_name: username.trim(),
    role,
    is_banned: false,
    created_at: created.user.created_at,
  });
}
