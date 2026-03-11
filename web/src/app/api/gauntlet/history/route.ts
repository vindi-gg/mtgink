import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

    const admin = getAdminClient();

    const { count } = await admin
      .from("gauntlet_results")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    const { data, error } = await admin
      .from("gauntlet_results")
      .select("id, mode, pool_size, champion_oracle_id, champion_illustration_id, champion_name, champion_wins, results, card_name, filter_label, completed_at")
      .eq("user_id", user.id)
      .order("completed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Failed to fetch gauntlet history:", error);
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    return NextResponse.json({ gauntlets: data ?? [], total: count ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
