import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const random = url.searchParams.get("random") === "1";

  const supabase = getAdminClient();

  if (random) {
    let query = supabase
      .from("gauntlet_themes")
      .select("*")
      .eq("is_active", true);

    const type = url.searchParams.get("type");
    if (type) query = query.eq("theme_type", type);

    const { data } = await query;

    if (!data || data.length === 0) {
      return NextResponse.json({ theme: null });
    }
    const theme = data[Math.floor(Math.random() * data.length)];
    return NextResponse.json({ theme });
  }

  if (q) {
    const { data } = await supabase
      .from("gauntlet_themes")
      .select("*")
      .eq("is_active", true)
      .ilike("label", `%${q}%`)
      .order("label")
      .limit(20);

    return NextResponse.json({ themes: data ?? [] });
  }

  return NextResponse.json({ error: "Provide ?q=search or ?random=1" }, { status: 400 });
}
