"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function saveSettings(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currency     = (formData.get("currency")     as string) ?? "SEK";
  const country_code = (formData.get("country_code") as string) ?? "se";

  await supabaseAdmin.from("user_settings").upsert(
    { user_id: user.id, currency, country_code, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );

  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

export async function deleteAccount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabaseAdmin.auth.admin.deleteUser(user.id);
  redirect("/");
}
