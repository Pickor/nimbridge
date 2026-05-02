"use client";

import { useState } from "react";

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  display_name: string;
  is_banned: boolean;
  created_at: string;
}

const ROLE_ORDER = ["owner", "admin", "moderator", "user", "pending"];
const ASSIGNABLE_ROLES = ["admin", "moderator", "user"];

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    owner:     "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    admin:     "bg-red-500/20 text-red-400 border-red-500/30",
    moderator: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    user:      "bg-neutral-500/20 text-neutral-400 border-neutral-500/30",
    pending:   "bg-orange-500/20 text-orange-400 border-orange-500/30",
  };
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${colors[role] ?? colors.user}`}
    >
      {role}
    </span>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
  myRole,
}: {
  onClose: () => void;
  onCreated: (user: AdminUser) => void;
  myRole: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myLevel = ROLE_ORDER.indexOf(myRole);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const created = (await res.json()) as AdminUser;
      onCreated(created);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-[calc(100vw-2rem)] sm:max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Create user</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wide">Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
              placeholder="e.g. johndoe"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wide">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wide">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option
                  key={r}
                  value={r}
                  disabled={ROLE_ORDER.indexOf(r) <= myLevel && myRole !== "owner"}
                >
                  {r}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-neutral-700 py-2 text-sm text-neutral-300 hover:border-neutral-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-white py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 transition-colors disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersTable({
  initialUsers,
  myRole,
}: {
  initialUsers: AdminUser[];
  myRole: string;
}) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const myLevel = ROLE_ORDER.indexOf(myRole);

  async function toggleBan(userId: string, isBanned: boolean) {
    setBusy(userId + "-ban");
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isBanned }),
    });
    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_banned: isBanned } : u))
      );
    } else {
      alert("Failed to update ban status");
    }
    setBusy(null);
  }

  async function deleteUser(userId: string) {
    setBusy(userId + "-delete");
    const res = await fetch(`/api/admin/users?userId=${userId}`, { method: "DELETE" });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } else {
      alert(await res.text());
    }
    setBusy(null);
    setConfirmDelete(null);
  }

  async function changeRole(userId: string, role: string) {
    setBusy(userId + "-role");
    const res = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role } : u))
      );
    } else {
      const text = await res.text();
      alert(`Failed to change role: ${text}`);
    }
    setBusy(null);
  }

  return (
    <>
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-[calc(100vw-2rem)] sm:max-w-xs rounded-xl border border-neutral-700 bg-neutral-900 p-6 space-y-4">
            <h2 className="text-base font-semibold text-white">Remove user?</h2>
            <p className="text-sm text-neutral-400">
              This permanently deletes the account. This cannot be undone.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg border border-neutral-700 py-2 text-sm text-neutral-300 hover:border-neutral-500 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={busy === confirmDelete + "-delete"}
                onClick={() => deleteUser(confirmDelete)}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {busy === confirmDelete + "-delete" ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          myRole={myRole}
          onClose={() => setShowCreate(false)}
          onCreated={(u) => setUsers((prev) => [...prev, u])}
        />
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">{users.length} users</span>
          {(myRole === "owner" || myRole === "admin") && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:bg-neutral-100 transition-colors"
            >
              <span>+</span> Create user
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400">
                <th className="py-2 pr-4 font-medium">User</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const userLevel = ROLE_ORDER.indexOf(u.role);
                const canModify = myLevel < userLevel || myRole === "owner";
                const isBusy = busy?.startsWith(u.id);

                return (
                  <tr
                    key={u.id}
                    className="border-b border-neutral-800/50 text-neutral-300"
                  >
                    <td className="py-3 pr-4">
                      <div className="font-medium text-white">
                        {u.display_name || "—"}
                      </div>
                      <div className="text-xs text-neutral-500">{u.email}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="py-3 pr-4">
                      {u.is_banned ? (
                        <span className="text-red-400 text-xs font-medium">Banned</span>
                      ) : (
                        <span className="text-green-400 text-xs font-medium">Active</span>
                      )}
                    </td>
                    <td className="py-3">
                      {canModify ? (
                        <div className="flex items-center gap-3 flex-wrap">
                          <select
                            disabled={isBusy || u.role === "owner"}
                            value={u.role === "owner" || u.role === "pending" ? "" : u.role}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white disabled:opacity-50 cursor-pointer"
                          >
                            {u.role === "owner" && (
                              <option value="owner">owner</option>
                            )}
                            {u.role === "pending" && (
                              <option value="" disabled>— assign role —</option>
                            )}
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option
                                key={r}
                                value={r}
                                disabled={
                                  ROLE_ORDER.indexOf(r) <= myLevel &&
                                  myRole !== "owner"
                                }
                              >
                                {r}
                              </option>
                            ))}
                          </select>

                          <button
                            disabled={isBusy}
                            onClick={() => toggleBan(u.id, !u.is_banned)}
                            className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                              u.is_banned
                                ? "bg-green-600/20 text-green-400 hover:bg-green-600/40"
                                : "bg-red-600/20 text-red-400 hover:bg-red-600/40"
                            }`}
                          >
                            {u.is_banned ? "Unban" : "Ban"}
                          </button>

                          {/* Remove */}
                          <button
                            disabled={isBusy}
                            onClick={() => setConfirmDelete(u.id)}
                            className="rounded px-2 py-1 text-xs font-medium text-neutral-500 hover:text-red-400 hover:bg-red-600/10 transition-colors disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <span className="text-neutral-600 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
