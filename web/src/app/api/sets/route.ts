import { NextResponse } from "next/server";
import { getPlayableSets } from "@/lib/queries";

export async function GET() {
  const sets = await getPlayableSets();
  return NextResponse.json({ sets });
}
