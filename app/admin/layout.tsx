import { createClient } from "@/lib/supabase/server";
import { getIdentity, hasLevel, ROLE_LEVEL } from "@/lib/admin/roles";
import { redirect } from "next/navigation";
import AppHeader from "@/components/app-header";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [identity, profileRes] = await Promise.all([
    getIdentity(user.id, user.email ?? ""),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  if (!hasLevel(identity, ROLE_LEVEL.moderator)) redirect("/dashboard");

  const displayName = profileRes.data?.display_name || undefined;

  return (
    <div className="min-h-screen bg-neutral-950">
      <AppHeader
        brand={<>🔭 Nimbridge <span className="text-sm font-normal text-neutral-400">Admin</span></>}
        links={[
          { kind: "link", href: "/admin",         label: "Stats",     active: false },
          { kind: "link", href: "/admin/users",   label: "Users",     active: false },
          { kind: "link", href: "/admin/signins", label: "Sign-ins",  active: false },
          { kind: "link", href: "/dashboard",     label: "Dashboard", active: false },
        ]}
        email={user.email ?? ""}
        displayName={displayName}
        role={identity.role}
      />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
