import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  async function signInWithGoogle() {
    "use server";
    const headersList = await headers();
    const origin = headersList.get("origin") ?? "";
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback` },
    });
    if (error || !data.url) redirect("/login?error=1");
    redirect(data.url);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950">
      <div className="flex flex-col items-center gap-8 p-8 text-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white">
            🔭 Nimbridge
          </h1>
          <p className="mt-2 text-neutral-400">
            Internal price-tracking dashboard
          </p>
        </div>
        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="flex items-center gap-3 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-neutral-900 shadow hover:bg-neutral-100 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                fill="#34A853"
              />
              <path
                d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>
        </form>
        {/* Error state */}
      </div>
    </main>
  );
}
