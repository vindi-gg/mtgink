import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPurchaseList } from "@/lib/deck-queries";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = getUserPurchaseList(user.id);
  return NextResponse.json({ items });
}
