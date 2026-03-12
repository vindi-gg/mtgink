import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const challengeId = req.nextUrl.searchParams.get("challenge_id");
  if (!challengeId) {
    return NextResponse.json({ error: "challenge_id required" }, { status: 400 });
  }

  const { data, error } = await getAdminClient()
    .from("daily_challenge_stats")
    .select("*")
    .eq("challenge_id", parseInt(challengeId, 10))
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }

  return NextResponse.json(data);
}
