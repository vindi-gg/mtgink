import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "30"), 1), 60);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "5"), 1), 30);

  const supabase = getAdminClient();
  const today = new Date();

  // Generate challenges for the range
  for (let i = offset; i < Math.min(offset + limit, days); i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    await supabase.rpc("generate_daily_challenges", { p_date: dateStr });
  }

  const startDate = new Date(today);
  startDate.setDate(today.getDate() + offset);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + offset + limit - 1);

  const { data } = await supabase
    .from("daily_challenges")
    .select("*")
    .gte("challenge_date", startDate.toISOString().split("T")[0])
    .lte("challenge_date", endDate.toISOString().split("T")[0])
    .order("challenge_date", { ascending: true })
    .order("challenge_type", { ascending: true });

  return NextResponse.json({
    challenges: data ?? [],
    total_days: days,
    offset,
    limit,
  });
}
