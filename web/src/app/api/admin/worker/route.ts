import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exec } from "child_process";

const WORKER_URL = "https://mtgink-images.vindi-llc.workers.dev";
const IS_LOCAL = process.env.NODE_ENV === "development";

const LOCAL_SCRIPTS: Record<string, string> = {
  data: "python3 scripts/import_data_postgres.py",
  cards: "python3 scripts/import_data_postgres.py && python3 scripts/download_images.py",
  prices: "python3 scripts/import_prices.py",
  tags: "python3 scripts/import_tags.py",
  images: "python3 scripts/download_images.py",
  sync: "python3 scripts/import_data_postgres.py && python3 scripts/download_images.py && python3 scripts/import_prices.py && python3 scripts/import_tags.py",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 500 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.user_metadata?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { job, status: checkStatus } = await request.json();

  if (IS_LOCAL) {
    if (checkStatus) {
      return NextResponse.json({ status: "local", message: "Running locally — no container" });
    }

    const script = LOCAL_SCRIPTS[job];
    if (!script) {
      return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 400 });
    }

    // Run in background — don't wait for completion
    const cwd = process.cwd().replace(/\/web$/, "");
    exec(script, { cwd }, (err, stdout, stderr) => {
      if (err) console.error(`[admin:${job}] error:`, stderr);
      else console.log(`[admin:${job}] done:`, stdout.slice(-200));
    });

    return NextResponse.json({
      success: true,
      message: `Started locally: ${script}`,
    });
  }

  // Prod: proxy to Cloudflare worker
  const params = new URLSearchParams();
  if (checkStatus) params.set("status", "1");
  else if (job) params.set("job", job);

  const res = await fetch(`${WORKER_URL}?${params}`);
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}
