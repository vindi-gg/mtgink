import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { tryProcessQueue } from "@/lib/moxfield-queue";

export async function GET(request: NextRequest) {
  const queueId = request.nextUrl.searchParams.get("id");
  if (!queueId) {
    return NextResponse.json({ error: "Missing queue id" }, { status: 400 });
  }

  const admin = getAdminClient();

  // Check this queue entry's status
  const { data: entry } = await admin
    .from("moxfield_queue")
    .select("id, status, result, error_message, created_at")
    .eq("id", queueId)
    .single();

  if (!entry) {
    return NextResponse.json({ error: "Queue entry not found" }, { status: 404 });
  }

  if (entry.status === "done") {
    await admin.from("moxfield_queue").delete().eq("id", queueId);
    return NextResponse.json({ status: "done", ...entry.result });
  }

  if (entry.status === "error") {
    await admin.from("moxfield_queue").delete().eq("id", queueId);
    return NextResponse.json({ status: "error", error: entry.error_message }, { status: 422 });
  }

  // Still pending/processing — try to process the queue
  await tryProcessQueue();

  // Re-check status after processing
  const { data: updated } = await admin
    .from("moxfield_queue")
    .select("id, status, result, error_message")
    .eq("id", queueId)
    .single();

  if (!updated) {
    return NextResponse.json({ error: "Queue entry not found" }, { status: 404 });
  }

  if (updated.status === "done") {
    await admin.from("moxfield_queue").delete().eq("id", queueId);
    return NextResponse.json({ status: "done", ...updated.result });
  }

  if (updated.status === "error") {
    await admin.from("moxfield_queue").delete().eq("id", queueId);
    return NextResponse.json({ status: "error", error: updated.error_message }, { status: 422 });
  }

  // Still waiting — return position
  const { count } = await admin
    .from("moxfield_queue")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "processing"])
    .lte("created_at", entry.created_at);

  return NextResponse.json({ status: "pending", position: count ?? 1 });
}
