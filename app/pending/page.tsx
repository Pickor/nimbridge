import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getIdentity, ROLE_LEVEL } from "@/lib/admin/roles";

export default async function PendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Must be logged in
  if (!user) redirect("/login");

  const identity = await getIdentity(user.id, user.email ?? "");

  // Already approved → go to dashboard
  if (identity.level >= ROLE_LEVEL.user) redirect("/dashboard");

  const email = user.email ?? "";

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center">

        <div className="mx-auto w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-3xl">
          🔭
        </div>

        <div>
          <h1 className="text-xl font-bold text-white">Application received</h1>
          <p className="mt-2 text-neutral-400 text-sm leading-relaxed">
            Your application to use <span className="text-white font-medium">Nimbridge</span> is on the way.
            An admin will review your request and grant access shortly.
          </p>
        </div>

        <div className="rounded-lg bg-neutral-800/60 border border-neutral-700 px-4 py-3 text-sm text-neutral-300">
          Signed in as <span className="text-white font-medium">{email}</span>
        </div>

        <p className="text-xs text-neutral-600">
          Once approved, sign out and sign back in to access the app.
        </p>

        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </form>

      </div>
    </main>
  );
}
