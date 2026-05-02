import { createClient } from "@/lib/supabase/server";
import { getIdentity, OWNER_EMAIL } from "@/lib/admin/roles";
import { supabaseAdmin } from "@/lib/supabase/admin";
import UsersTable, { type AdminUser } from "./users-table";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [myIdentity, authData, rolesData, profilesData] = await Promise.all([
    getIdentity(user.id, user.email ?? ""),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 }),
    supabaseAdmin.from("user_roles").select("user_id, role"),
    supabaseAdmin
      .from("profiles")
      .select("id, display_name, is_banned"),
  ]);

  const authUsers = authData.data?.users ?? [];
  const roleMap = new Map(
    (rolesData.data ?? []).map((r) => [r.user_id as string, r.role as string])
  );
  const profileMap = new Map(
    (profilesData.data ?? []).map((p) => [
      p.id as string,
      p as { id: string; display_name: string; is_banned: boolean },
    ])
  );

  const users: AdminUser[] = authUsers.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    role:
      u.email === OWNER_EMAIL ? "owner" : (roleMap.get(u.id) ?? "pending"),
    display_name: profileMap.get(u.id)?.display_name ?? "",
    is_banned: profileMap.get(u.id)?.is_banned ?? false,
    created_at: u.created_at,
  }));

  // Sort: owner first, then by role level, pending last
  const ORDER = ["owner", "admin", "moderator", "user", "pending"];
  users.sort((a, b) => {
    const ro = ORDER.indexOf(a.role) - ORDER.indexOf(b.role);
    if (ro !== 0) return ro;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Users</h1>
      <UsersTable initialUsers={users} myRole={myIdentity.role} />
    </div>
  );
}
