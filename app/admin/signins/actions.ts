"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "owner"])
    .maybeSingle();

  if (!data) throw new Error("Not authorized");
}

export async function removeIpBlock(ip: string) {
  await assertAdmin();

  await supabaseAdmin
    .from("ip_rate_limits")
    .update({
      fail_count:    0,
      timeout_count: 0,
      locked_until:  null,
      is_permanent:  false,
      updated_at:    new Date().toISOString(),
    })
    .eq("ip", ip);

  revalidatePath("/admin/signins");
}
