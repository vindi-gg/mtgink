import { NextResponse } from "next/server";
import { getCreatureTribes } from "@/lib/queries";

export async function GET() {
  const tribes = await getCreatureTribes();
  return NextResponse.json({ tribes });
}
