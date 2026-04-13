import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/bracket/results/[id]
 * Load a completed bracket for the read-only results page.
 * Returns the completion + seed info for rendering.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = getAdminClient();

  const { data: completion, error } = await admin
    .from("bracket_completions")
    .select("id, seed_id, user_id, champion_illustration_id, champion_name, bracket_state, completed_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !completion) {
    return NextResponse.json({ error: "Results not found" }, { status: 404 });
  }

  // Fetch the seed for theme label + bracket size
  const { data: seed } = await admin
    .from("bracket_seeds")
    .select("id, label, bracket_size, play_count")
    .eq("id", completion.seed_id)
    .maybeSingle();

  return NextResponse.json({
    completion,
    seed: seed ?? null,
  });
}
