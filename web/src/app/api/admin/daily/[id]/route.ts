import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const allowedFields = ["pool", "title", "description", "theme_id", "brew_id", "gauntlet_mode", "bracket_size", "preview_set_code", "preview_collector_number", "preview_image_version"];
  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await getAdminClient()
    .from("daily_challenges")
    .update(updates)
    .eq("id", parseInt(id))
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/daily/bracket");
  revalidatePath("/daily/gauntlet");
  revalidatePath("/daily/bracket/results");
  revalidatePath("/daily/gauntlet/results");

  return NextResponse.json({ challenge: data });
}
