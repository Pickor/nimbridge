"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function updateDisplayName(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const displayName = ((formData.get("display_name") as string) ?? "").trim();
  if (!displayName) redirect("/profile?error=empty");

  await supabaseAdmin
    .from("profiles")
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}
