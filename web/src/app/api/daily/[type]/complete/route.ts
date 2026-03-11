import { NextResponse } from "next/server";
import { getDailyChallenge, recordDailyParticipation } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;

  if (!["remix", "vs", "gauntlet"].includes(type)) {
    return NextResponse.json({ error: "Invalid challenge type" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { session_id, result } = body;

    if (!session_id || !result) {
      return NextResponse.json({ error: "session_id and result required" }, { status: 400 });
    }

    const challenge = await getDailyChallenge(type);
    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    // Get user_id if authenticated
    let userId: string | null = null;
    const supabase = await createClient();
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }

    const stats = await recordDailyParticipation(
      challenge.id,
      session_id,
      userId,
      result,
    );

    return NextResponse.json({ stats, challenge });
  } catch (err) {
    console.error(`Failed to complete daily ${type}:`, err);
    return NextResponse.json({ error: "Failed to record participation" }, { status: 500 });
  }
}
