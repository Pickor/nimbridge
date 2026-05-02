/**
 * Role hierarchy and identity resolver.
 *
 * Roles ordered by privilege:
 *   pending (0) → user (1) → moderator (2) → admin (3) → owner (4)
 *
 * "owner" is not stored in the DB; it's derived from the OWNER_EMAIL env
 * var so the owner can never be locked out by a misconfigured user_roles row.
 *
 * "pending" is also not stored as a DB column value — `getIdentity` treats
 * any user without a real role-row as pending, plus stored 'pending'
 * (migration 0018) as the same level-0 state.
 *
 * `hasLevel(identity, ROLE_LEVEL.user)` is the standard auth check before
 * showing /dashboard, /favorites, /history.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

export type Role = "owner" | "admin" | "moderator" | "user" | "pending";

export const ROLE_LEVEL: Record<Role, number> = {
  owner:    4,
  admin:    3,
  moderator:2,
  user:     1,
  pending:  0,  // signed in but not yet approved
};

export const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";

export interface Identity {
  userId: string;
  email: string;
  role: Role;
  level: number;
  isBanned: boolean;
}

export async function getIdentity(userId: string, email: string): Promise<Identity> {
  if (OWNER_EMAIL && email === OWNER_EMAIL) {
    return { userId, email, role: "owner", level: 4, isBanned: false };
  }

  const [{ data: roleRow }, { data: profile }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("profiles").select("is_banned").eq("id", userId).maybeSingle(),
  ]);

  // No role row OR stored 'pending' = new user awaiting approval
  const role: Role =
    roleRow?.role && roleRow.role !== "pending"
      ? (roleRow.role as Exclude<Role, "owner" | "pending">)
      : "pending";

  return {
    userId,
    email,
    role,
    level: ROLE_LEVEL[role],
    isBanned: profile?.is_banned ?? false,
  };
}

export function hasLevel(identity: Identity, minLevel: number): boolean {
  if (identity.isBanned) return false;
  return identity.level >= minLevel;
}
