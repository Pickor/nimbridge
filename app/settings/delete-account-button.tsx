"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "./actions";

export default function DeleteAccountButton() {
  const [step, setStep]         = useState<"idle" | "confirm">("idle");
  const [pending, startTransition] = useTransition();

  if (step === "idle") {
    return (
      <button
        onClick={() => setStep("confirm")}
        className="px-4 py-2 rounded-lg border border-red-500/40 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors"
      >
        Delete my account
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 space-y-3">
      <p className="text-sm text-red-400 font-medium">Are you sure?</p>
      <p className="text-xs text-red-400/80">
        This permanently deletes your account, favorites, and all settings. This cannot be undone.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => startTransition(() => deleteAccount())}
          disabled={pending}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-500 transition-colors disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Yes, delete everything"}
        </button>
        <button
          onClick={() => setStep("idle")}
          disabled={pending}
          className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-400 text-sm hover:text-white hover:border-neutral-500 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
