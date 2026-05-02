/**
 * Avatar dropdown in the top-right of the AppHeader.
 *
 * Shows the user's display name + role badge, and exposes
 * Settings / Profile / Sign-out links. Sign-out clears the
 * Supabase session and pushes /login.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const ROLE_COLORS: Record<string, string> = {
  owner:     "text-yellow-400",
  admin:     "text-red-400",
  moderator: "text-blue-400",
  user:      "text-neutral-400",
};

interface Props {
  email: string;
  displayName?: string;
  role?: string;
}

export default function UserMenu({ email, displayName, role }: Props) {
  const [open, setOpen]         = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const label = displayName || email;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors"
      >
        <span className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
          {label[0]?.toUpperCase() ?? "?"}
        </span>
        <span className="hidden sm:inline max-w-[140px] truncate">{label}</span>
        {role && role !== "user" && (
          <span className={`hidden sm:inline text-xs font-medium ${ROLE_COLORS[role] ?? "text-neutral-400"}`}>
            {role}
          </span>
        )}
        <svg
          className={`w-3 h-3 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-52 rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl z-20 py-1">

            {/* Email */}
            <div className="px-3 py-2 border-b border-neutral-800">
              <p className="text-xs text-neutral-500 truncate">{email}</p>
            </div>

            {/* Profile */}
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </Link>

            {/* Settings */}
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Link>

            {/* Divider + Logout */}
            <div className="border-t border-neutral-800 mt-1 pt-1">
              <button
                onClick={signOut}
                disabled={signingOut}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {signingOut ? "Signing out…" : "Logout"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
