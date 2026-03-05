import { NextRequest, NextResponse } from "next/server";
import {
  getCardBySlug,
  getIllustrationsForCard,
  getRatingsForCard,
  getPrintingsForCard,
} from "@/lib/queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const card = getCardBySlug(slug);

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const illustrations = getIllustrationsForCard(card.oracle_id);
  const ratings = getRatingsForCard(card.oracle_id);
  const printingsMap = getPrintingsForCard(card.oracle_id);

  // Merge ratings and printings into illustrations
  const ratingsMap = new Map(ratings.map((r) => [r.illustration_id, r]));
  const illustrationsWithData = illustrations.map((ill) => ({
    ...ill,
    rating: ratingsMap.get(ill.illustration_id) ?? null,
    printings: printingsMap.get(ill.illustration_id) ?? [],
  }));

  // Sort by ELO (rated first, then unrated)
  illustrationsWithData.sort((a, b) => {
    if (a.rating && b.rating)
      return b.rating.elo_rating - a.rating.elo_rating;
    if (a.rating) return -1;
    if (b.rating) return 1;
    return 0;
  });

  return NextResponse.json({
    card,
    illustrations: illustrationsWithData,
  });
}
