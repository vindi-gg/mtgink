import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/daily/[id]/reset
 * Deletes all participations and resets stats for a daily challenge.
 * Admin-only. Used before updating a live (today's) challenge so
 * the pool change doesn't leave stale results.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const challengeId = parseInt(id);
  if (isNaN(challengeId)) {
    return NextResponse.json({ error: "Invalid challenge ID" }, { status: 400 });
  }

  // Admin check
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.user_metadata?.is_admin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const admin = getAdminClient();

  // Delete all participations for this challenge.
  const { error: partErr } = await admin
    .from("daily_participations")
    .delete()
    .eq("challenge_id", challengeId);
  if (partErr) {
    return NextResponse.json({ error: partErr.message }, { status: 500 });
  }

  // Reset the stats row to zeroes.
  const { error: statsErr } = await admin
    .from("daily_challenge_stats")
    .update({
      participation_count: 0,
      illustration_votes: null,
      side_a_votes: 0,
      side_b_votes: 0,
      champion_counts: null,
      avg_champion_wins: null,
      max_champion_wins: 0,
      bracket_matchups: null,
    })
    .eq("challenge_id", challengeId);
  if (statsErr) {
    return NextResponse.json({ error: statsErr.message }, { status: 500 });
  }

  revalidatePath("/daily/bracket");
  revalidatePath("/daily/gauntlet");
  revalidatePath("/daily/bracket/results");
  revalidatePath("/daily/gauntlet/results");

  return NextResponse.json({ ok: true, challenge_id: challengeId });
}
