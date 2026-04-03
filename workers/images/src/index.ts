import { Container, ContainerProxy, getContainer } from "@cloudflare/containers";
export { ContainerProxy };

interface Env {
  IMAGE_SCRAPER: DurableObjectNamespace<ImageScraper>;
  R2_BUCKET: R2Bucket;
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_UPLOAD_SECRET: string;
  SUPABASE_DB_URL: string;
  DISCORD_WEBHOOK_URL: string;
  VERCEL_REVALIDATE_SECRET: string;
  VERCEL_URL: string;
}

export class ImageScraper extends Container {
  defaultPort = 8080;
  enableInternet = true;
  sleepAfter = "10m";

  // Outbound worker: container can access R2 via http://r2/{key}
  static outboundByHost = {
    "r2.mtgink": async (request: Request, env: Env) => {
      const key = new URL(request.url).pathname.slice(1);
      if (!key) return new Response("Missing key", { status: 400 });

      if (request.method === "PUT" || request.method === "POST") {
        const body = await request.arrayBuffer();
        await env.R2_BUCKET.put(key, body, {
          httpMetadata: { contentType: request.headers.get("content-type") || "image/jpeg" },
        });
        return new Response(JSON.stringify({ ok: true, key, size: body.byteLength }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (request.method === "HEAD") {
        const obj = await env.R2_BUCKET.head(key);
        if (obj && obj.size > 0) {
          return new Response(null, { status: 200, headers: { "content-length": String(obj.size) } });
        }
        return new Response(null, { status: 404 });
      }

      if (request.method === "GET") {
        const obj = await env.R2_BUCKET.get(key);
        if (!obj) return new Response(null, { status: 404 });
        return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "application/octet-stream" } });
      }

      return new Response("Method not allowed", { status: 405 });
    },
  };

  constructor(ctx: any, env: Env) {
    super(ctx, env);
    this.envVars = {
      SUPABASE_DB_URL: env.SUPABASE_DB_URL || "",
      R2_ENDPOINT: `https://${env.R2_ACCOUNT_ID || "7dad892db6ba7c0845a9a8572da362fc"}.r2.cloudflarestorage.com`,
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID || "",
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY || "",
      R2_BUCKET: "mtgink-cdn",
      USE_R2: "1",
      CONCURRENCY: "8",
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
      DISCORD_WEBHOOK_URL: env.DISCORD_WEBHOOK_URL || "",
      VERCEL_REVALIDATE_SECRET: env.VERCEL_REVALIDATE_SECRET || "",
      VERCEL_URL: env.VERCEL_URL || "https://mtg.ink",
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
  opts?: { setCodes?: string; force?: boolean; since?: string }
): Promise<unknown> {
  const params = new URLSearchParams({ job: jobType });
  if (opts?.setCodes) params.set("sets", opts.setCodes);
  if (opts?.force) params.set("force", "1");
  if (opts?.since) params.set("since", opts.since);
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
  opts?: { setCodes?: string; restart?: boolean; force?: boolean; jobType?: string; since?: string }
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
    since: opts?.since,
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
      // R2 upload endpoint — container POSTs images here
      if ((request.method === "PUT" || request.method === "POST") && url.pathname === "/r2") {
        const secret = request.headers.get("x-upload-secret");
        if (secret !== env.R2_UPLOAD_SECRET) {
          return new Response("Unauthorized", { status: 401 });
        }
        const key = url.searchParams.get("key");
        if (!key) return new Response("Missing key", { status: 400 });
        const body = await request.arrayBuffer();
        await env.R2_BUCKET.put(key, body, { httpMetadata: { contentType: "image/jpeg" } });
        return new Response(JSON.stringify({ ok: true, key, size: body.byteLength }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // R2 check endpoint — container checks if object exists
      if (request.method === "HEAD" && url.pathname === "/r2") {
        const key = url.searchParams.get("key");
        if (!key) return new Response("Missing key", { status: 400 });
        const obj = await env.R2_BUCKET.head(key);
        if (obj && obj.size > 1000) {
          return new Response(null, { status: 200, headers: { "content-length": String(obj.size) } });
        }
        return new Response(null, { status: 404 });
      }

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
        jobType === "data"
          ? "card data import from Scryfall"
          : jobType === "tags"
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

    // Wait for HTTP server
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await fetchContainerStatus(container);
      if (status) break;
    }

    await triggerJob(container, "sync");
  },
};
