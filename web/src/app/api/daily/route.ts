import { NextResponse } from "next/server";
import { getDailyChallenges } from "@/lib/queries";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  try {
    const challenges = await getDailyChallenges(sessionId);
    return NextResponse.json(challenges);
  } catch (err) {
    console.error("Failed to get daily challenges:", err);
    return NextResponse.json({ error: "Failed to load daily challenges" }, { status: 500 });
  }
}
