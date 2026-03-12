import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  const idsParam = req.nextUrl.searchParams.get("ids");

  if (!sessionId || !idsParam) {
    return NextResponse.json([]);
  }

  const ids = idsParam.split(",").map(Number).filter(Boolean);
  if (ids.length === 0) return NextResponse.json([]);

  const admin = getAdminClient();
  const { data } = await admin
    .from("daily_participations")
    .select("challenge_id")
    .eq("session_id", sessionId)
    .in("challenge_id", ids);

  const participatedIds = (data ?? []).map((r: { challenge_id: number }) => r.challenge_id);
  return NextResponse.json(participatedIds);
}
