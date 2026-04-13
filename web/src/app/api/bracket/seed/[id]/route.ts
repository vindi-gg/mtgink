import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/bracket/seed/[id] — load a bracket seed for shared play links.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { data, error } = await getAdminClient()
    .from("bracket_seeds")
    .select("id, params, label, bracket_size, seed, pool, play_count, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Seed not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
