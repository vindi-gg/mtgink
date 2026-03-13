import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDeckById, updateDeckCardAdmin } from "@/lib/deck-queries";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ deckId: string; oracleId: string }> }
) {
  const { deckId, oracleId } = await params;

  const deck = await getDeckById(deckId);
  if (!deck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If deck has an owner, verify auth
  if (deck.user_id) {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || deck.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json();
  const { selected_illustration_id, to_buy } = body as {
    selected_illustration_id?: string;
    to_buy?: boolean;
  };

  await updateDeckCardAdmin(deckId, oracleId, { selected_illustration_id, to_buy });
  return NextResponse.json({ ok: true });
}
