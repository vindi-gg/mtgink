import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    session_id,
    mode,
    pool_size,
    champion_oracle_id,
    champion_illustration_id,
    champion_name,
    champion_wins,
    results,
    daily_challenge_id,
    card_name,
    filter_label,
  } = body;

  if (!session_id || !mode || !results || !champion_oracle_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Get user_id if logged in
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    if (!supabase) throw new Error("no auth");
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Not logged in, that's fine
  }

  const admin = getAdminClient();

  const { error } = await admin.from("gauntlet_results").insert({
    user_id: userId,
    session_id,
    mode,
    pool_size,
    champion_oracle_id,
    champion_illustration_id,
    champion_name,
    champion_wins,
    results,
    daily_challenge_id: daily_challenge_id ?? null,
    card_name: card_name ?? null,
    filter_label: filter_label ?? null,
  });

  if (error) {
    console.error("Failed to save gauntlet result:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
