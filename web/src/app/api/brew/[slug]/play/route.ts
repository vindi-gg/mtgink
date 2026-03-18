import { NextRequest, NextResponse } from "next/server";
import { getBrewBySlug, incrementPlayCount } from "@/lib/brew-queries";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const brew = await getBrewBySlug(slug);
    if (!brew) {
      return NextResponse.json({ error: "Brew not found" }, { status: 404 });
    }

    await incrementPlayCount(brew.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to increment play count" }, { status: 500 });
  }
}
