/**
 * POST/DELETE /api/favorites — toggle a starred lot for the current user.
 * Body: { listing_id }. The favorite-button component calls this with
 * optimistic UI: it flips the heart immediately and rolls back on error.
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface FavoriteBody {
  listing_id: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listing_id } = (await request.json()) as FavoriteBody;
  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: user.id, listing_id });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listing_id } = (await request.json()) as FavoriteBody;
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("listing_id", listing_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
