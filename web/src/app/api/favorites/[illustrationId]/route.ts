import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { addFavorite, removeFavorite } from "@/lib/user-queries";

const FAVORITE_ELO_BOOST = 25;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ illustrationId: string }> }
) {
  try {
    const supabase = await createClient();
    if (!supabase) return NextResponse.json({ error: "Auth not configured" }, { status: 500 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { illustrationId } = await params;
    const body = await request.json();
    if (!body.oracle_id) return NextResponse.json({ error: "Missing oracle_id" }, { status: 400 });

    await Promise.all([
      addFavorite(user.id, illustrationId, body.oracle_id, body.source || "ink"),
      getAdminClient().rpc("boost_elo", {
        p_illustration_id: illustrationId,
        p_oracle_id: body.oracle_id,
        p_scope: "remix",
        p_boost: FAVORITE_ELO_BOOST,
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ illustrationId: string }> }
) {
  try {
    const supabase = await createClient();
    if (!supabase) return NextResponse.json({ error: "Auth not configured" }, { status: 500 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { illustrationId } = await params;

    await Promise.all([
      removeFavorite(user.id, illustrationId),
      getAdminClient().rpc("boost_elo", {
        p_illustration_id: illustrationId,
        p_oracle_id: "00000000-0000-0000-0000-000000000000",
        p_scope: "remix",
        p_boost: -FAVORITE_ELO_BOOST,
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
