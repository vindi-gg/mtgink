import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const scryfallId = searchParams.get("scryfall_id");
  const oracleId = searchParams.get("oracle_id");

  if (!scryfallId && !oracleId) {
    return NextResponse.json({ error: "Provide scryfall_id or oracle_id" }, { status: 400 });
  }

  try {
    if (scryfallId) {
      const { data } = await getAdminClient()
        .from("best_prices")
        .select("*")
        .eq("scryfall_id", scryfallId);
      return NextResponse.json(data ?? []);
    }

    // For oracle_id: get cheapest price across all printings
    const { data: printings } = await getAdminClient()
      .from("printings")
      .select("scryfall_id")
      .eq("oracle_id", oracleId!);

    if (!printings || printings.length === 0) {
      return NextResponse.json([]);
    }

    const { data } = await getAdminClient()
      .from("best_prices")
      .select("*")
      .in("scryfall_id", printings.map((p) => p.scryfall_id))
      .order("market_price", { ascending: true })
      .limit(3);

    return NextResponse.json(data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
