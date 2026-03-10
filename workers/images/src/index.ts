import { Container, getContainer } from "@cloudflare/containers";

interface Env {
  IMAGE_SCRAPER: DurableObjectNamespace<ImageScraper>;
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  SUPABASE_DB_URL: string;
}

export class ImageScraper extends Container {
  defaultPort = 8080;
  enableInternet = true;
  sleepAfter = "6h";

  constructor(ctx: any, env: Env) {
    super(ctx, env);
    // Set envVars as a property (not getter) to pass credentials to container
    this.envVars = {
      R2_ENDPOINT: env.R2_ENDPOINT || "",
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID || "",
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY || "",
      R2_BUCKET: "mtgink-cdn",
      SUPABASE_DB_URL: env.SUPABASE_DB_URL || "",
      CONCURRENCY: "8",
    };
  }

  override onStart() {
    console.log("MTG Ink container started");
    this.schedule(30, "keepAlive");
  }

  async keepAlive() {
    this.renewActivityTimeout();
    try {
      const resp = await this.containerFetch("http://localhost:8080/");
      const status = (await resp.json()) as Record<string, unknown>;
      const state = status.state as string;
      console.log(
        `Keep-alive: ${state} — uploaded=${status.uploaded}, skipped=${status.skipped}, failed=${status.failed}`
      );
      if (
        state === "processing" ||
        state === "loading" ||
        state === "starting" ||
        state === "idle"
      ) {
        this.schedule(30, "keepAlive");
      } else {
        console.log("Container finished:", JSON.stringify(status));
      }
    } catch (err) {
      console.error("Keep-alive error:", String(err));
      this.schedule(30, "keepAlive");
    }
  }

  override async onActivityExpired() {
    try {
      const resp = await this.containerFetch("http://localhost:8080/");
      const status = (await resp.json()) as Record<string, unknown>;
      if (
        status.state === "processing" ||
        status.state === "loading"
      ) {
        console.log("Activity expired but still processing, renewing");
        this.renewActivityTimeout();
        return;
      }
    } catch {}
    await this.stop();
  }

  override onStop(params: { exitCode: number; reason: string }) {
    console.log("MTG Ink container stopped:", JSON.stringify(params));
  }

  override onError(error: unknown) {
    console.error("MTG Ink container error:", String(error));
  }
}

async function fetchContainerStatus(
  container: DurableObjectStub<ImageScraper>
): Promise<unknown> {
  try {
    const resp = await container.fetch("http://container:8080/");
    return await resp.json();
  } catch {
    return null;
  }
}

async function triggerJob(
  container: DurableObjectStub<ImageScraper>,
  jobType: string,
  opts?: { setCodes?: string; force?: boolean }
): Promise<unknown> {
  const params = new URLSearchParams({ job: jobType });
  if (opts?.setCodes) params.set("sets", opts.setCodes);
  if (opts?.force) params.set("force", "1");
  try {
    const resp = await container.fetch(
      `http://container:8080/run?${params.toString()}`,
      { method: "POST" }
    );
    return await resp.json();
  } catch {
    return null;
  }
}

async function startAndTrigger(
  env: Env,
  opts?: { setCodes?: string; restart?: boolean; force?: boolean; jobType?: string }
): Promise<{ state: unknown; status: unknown; triggered: unknown }> {
  const container = getContainer(env.IMAGE_SCRAPER);

  if (opts?.restart) {
    try {
      await container.destroy();
      await new Promise((r) => setTimeout(r, 2000));
    } catch {
      // Container might not be running
    }
  }

  await container.start({ enableInternet: true });

  // Wait for HTTP server to come up
  let containerStatus: unknown = null;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    containerStatus = await fetchContainerStatus(container);
    if (containerStatus) break;
  }

  // Trigger the job via HTTP POST
  const jobType = opts?.jobType || "images";
  const triggered = await triggerJob(container, jobType, {
    setCodes: opts?.setCodes,
    force: opts?.force,
  });

  const state = await container.getState();
  return { state, status: containerStatus, triggered };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const setCodes = url.searchParams.get("sets") || undefined;
    const jobType = url.searchParams.get("job") || undefined;
    const debug = url.searchParams.get("debug") === "1";
    const checkStatus = url.searchParams.get("status") === "1";
    const restart = url.searchParams.get("restart") === "1";
    const force = url.searchParams.get("force") === "1";

    try {
      if (debug) {
        const container = getContainer(env.IMAGE_SCRAPER);
        const state = await container.getState();
        return new Response(
          JSON.stringify({
            containerState: state,
            envCheck: {
              R2_ENDPOINT: env.R2_ENDPOINT ? "set" : "NOT SET",
              R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID ? "set" : "NOT SET",
              R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY
                ? "set"
                : "NOT SET",
              SUPABASE_DB_URL: env.SUPABASE_DB_URL ? "set" : "NOT SET",
            },
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (checkStatus) {
        const container = getContainer(env.IMAGE_SCRAPER);
        const status = await fetchContainerStatus(container);
        if (status) {
          return new Response(JSON.stringify(status), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            error: "Container not running or not responding",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }

      const { state, status, triggered } = await startAndTrigger(env, {
        setCodes,
        restart,
        force,
        jobType,
      });

      const jobLabel =
        jobType === "tags"
          ? "tag import"
          : jobType === "prices"
            ? "price import from Scryfall"
            : setCodes
              ? `image scrape for sets: ${setCodes}`
              : `image scrape for all printings${force ? " (force re-download)" : ""}`;

      return new Response(
        JSON.stringify({
          success: true,
          message: `Container started: ${jobLabel}`,
          containerState: state,
          containerStatus: status,
          jobTriggered: triggered,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: (err as Error).message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    console.log("Scheduled MTG Ink job triggered");
    const container = getContainer(env.IMAGE_SCRAPER);
    await container.start({ enableInternet: true });

    // Wait for HTTP server, then trigger default images job
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await fetchContainerStatus(container);
      if (status) break;
    }
    await triggerJob(container, "images");
  },
};
