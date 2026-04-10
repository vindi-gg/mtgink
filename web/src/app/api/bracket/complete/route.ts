import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface BracketMatchup {
  winner_illustration_id: string;
  loser_illustration_id: string;
  winner_oracle_id: string;
  loser_oracle_id: string;
}

// Anonymous bracket votes use lower K-factor (same as gauntlet)
const ANON_BRACKET_K_FACTOR = 16;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { session_id, matchups, brew_slug } = (body ?? {}) as {
    session_id?: string;
    matchups?: BracketMatchup[];
    brew_slug?: string;
  };

  if (!session_id || !Array.isArray(matchups) || matchups.length === 0) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Get user_id if logged in
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }
  } catch {
    /* not logged in */
  }

  const admin = getAdminClient();
  const kFactor = userId ? undefined : ANON_BRACKET_K_FACTOR;

  // Pass the array directly — Supabase serializes to JSONB. Pre-stringifying
  // produces a JSONB string scalar that jsonb_array_elements() can't iterate.
  const { error: eloErr } = await admin.rpc("process_bracket_matchups", {
    p_matchups: matchups,
    p_session_id: session_id,
    p_user_id: userId ?? null,
    p_k_factor: kFactor ?? null,
  });

  if (eloErr) {
    console.error("Failed to process bracket ELO updates:", eloErr);
    return NextResponse.json({ error: "Failed to record votes" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    recorded: matchups.length,
    brew_slug: brew_slug ?? null,
  });
}
