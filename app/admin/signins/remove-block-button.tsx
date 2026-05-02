"use client";

import { useTransition } from "react";
import { removeIpBlock } from "./actions";

export default function RemoveBlockButton({ ip }: { ip: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(() => removeIpBlock(ip));
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="px-2.5 py-1 text-xs rounded-md bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {pending ? "Removing…" : "Remove block"}
    </button>
  );
}
