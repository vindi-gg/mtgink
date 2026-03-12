import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const sessionId = searchParams.get("session_id");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "5", 10), 20);

  // Try auth first, fall back to session_id
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }
  } catch {
    // Not logged in
  }

  if (!userId && !sessionId) {
    return NextResponse.json({ gauntlets: [] });
  }

  const admin = getAdminClient();
  let query = admin
    .from("gauntlet_results")
    .select("id, mode, pool_size, champion_name, champion_wins, results, card_name, filter_label, daily_challenge_id, completed_at")
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq("user_id", userId);
  } else {
    query = query.eq("session_id", sessionId!);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ gauntlets: [] });
  }

  return NextResponse.json({ gauntlets: data ?? [] });
}
