import { NextRequest, NextResponse } from "next/server";
import { getTags } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || undefined;
  const type = request.nextUrl.searchParams.get("type") || undefined;
  const source = request.nextUrl.searchParams.get("source") || undefined;
  const { tags, total } = await getTags(q, type, 1, 20, source);
  return NextResponse.json({ tags, total });
}
