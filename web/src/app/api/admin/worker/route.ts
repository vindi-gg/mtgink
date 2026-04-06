import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { exec } from "child_process";

const WORKER_URL = "https://mtgink-images.vindi-llc.workers.dev";
const IS_LOCAL = process.env.NODE_ENV === "development";

const LOCAL_SCRIPTS: Record<string, string> = {
  data: "python3 scripts/download_bulk.py && python3 scripts/import_data_postgres.py",
  cards: "python3 scripts/download_bulk.py && python3 scripts/import_data_postgres.py && python3 scripts/download_images.py",
  prices: "python3 scripts/import_prices.py",
  tags: "python3 scripts/import_tags.py",
  images: "python3 scripts/download_images.py",
  sync: "python3 scripts/download_bulk.py && python3 scripts/import_data_postgres.py && python3 scripts/download_images.py && python3 scripts/import_prices.py && python3 scripts/import_tags.py",
  og: "echo 'OG generation requires Cloudflare worker — not available locally'",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 500 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.user_metadata?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { job, status: checkStatus } = await request.json();
  const admin = getAdminClient();

  // Poll status
  if (checkStatus) {
    if (IS_LOCAL) {
      const { data } = await admin
        .from("job_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return NextResponse.json(data ?? { status: "idle" });
    }
    const params = new URLSearchParams({ status: "1" });
    const res = await fetch(`${WORKER_URL}?${params}`);
    return NextResponse.json(await res.json(), { status: res.status });
  }

  if (IS_LOCAL) {
    const script = LOCAL_SCRIPTS[job];
    if (!script) return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 400 });

    // Create job_runs entry
    const { data: run } = await admin
      .from("job_runs")
      .insert({ job_type: job, status: "running", message: `Started: ${job}` })
      .select("id")
      .single();
    const runId = run?.id;

    const cwd = process.cwd().replace(/\/web$/, "");
    const child = exec(script, { cwd, maxBuffer: 10 * 1024 * 1024 });

    let lastLine = "";
    child.stdout?.on("data", (chunk: string) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      if (lines.length) lastLine = lines[lines.length - 1];
      // Update progress periodically
      if (runId) {
        admin.from("job_runs").update({ message: lastLine }).eq("id", runId).then(() => {});
      }
    });

    child.stderr?.on("data", (chunk: string) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      if (lines.length) lastLine = lines[lines.length - 1];
    });

    child.on("close", (code) => {
      if (runId) {
        admin.from("job_runs").update({
          status: code === 0 ? "done" : "error",
          message: code === 0 ? `Completed: ${job}` : `Failed (exit ${code}): ${lastLine}`,
          completed_at: new Date().toISOString(),
        }).eq("id", runId).then(() => {});
      }
    });

    return NextResponse.json({ success: true, runId, message: `Started: ${job}` });
  }

  // Prod: proxy to Cloudflare worker
  // "cards" bundle doesn't exist on the worker — run data then images sequentially
  if (job === "cards") {
    const r1 = await fetch(`${WORKER_URL}?job=data`);
    const d1 = await r1.json();
    if (!r1.ok) return NextResponse.json(d1, { status: r1.status });
    // Worker handles images after data in sync, but we trigger explicitly
    const r2 = await fetch(`${WORKER_URL}?job=images`);
    const d2 = await r2.json();
    return NextResponse.json({ data: d1, images: d2 });
  }

  const params = new URLSearchParams();
  if (job) params.set("job", job);
  const res = await fetch(`${WORKER_URL}?${params}`);
  return NextResponse.json(await res.json(), { status: res.status });
}
