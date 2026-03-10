/**
 * MTG Ink image scraper container.
 *
 * Queries Supabase Postgres for printings, downloads art_crop and normal
 * images from Scryfall CDN, and uploads to Cloudflare R2.
 *
 * No resizing — Scryfall images are already the right size:
 *   art_crop: ~626x457 (~40-80KB)
 *   normal:   ~488x680 (~60-100KB)
 *
 * R2 key structure matches the frontend URL pattern:
 *   {set_code}/{collector_number}_art_crop.jpg
 *   {set_code}/{collector_number}_normal.jpg
 *
 * Env vars:
 *   SUPABASE_DB_URL      - Postgres connection string
 *   R2_ENDPOINT          - R2 S3 endpoint
 *   R2_ACCESS_KEY_ID     - R2 API token access key
 *   R2_SECRET_ACCESS_KEY - R2 API token secret
 *   R2_BUCKET            - R2 bucket name (default: mtgink-cdn)
 *   SET_CODES            - Comma-separated set codes to process (optional)
 *   CONCURRENCY          - Parallel downloads (default: 8)
 *   OUTPUT_DIR           - Write to local disk instead of R2 (for testing)
 *   FORCE                - Re-download even if exists (default: false)
 */

import { createServer } from "http";
import { mkdirSync, existsSync } from "fs";
import { writeFile } from "fs/promises";
import path from "path";
import pg from "pg";

// ── Status tracking ─────────────────────────────────────

interface ScrapeStatus {
  state: "idle" | "starting" | "loading" | "processing" | "done" | "error";
  message: string;
  job?: string;
  printings?: number;
  jobs?: number;
  uploaded?: number;
  skipped?: number;
  failed?: number;
  elapsed?: string;
  error?: string;
  env?: Record<string, string>;
}

const status: ScrapeStatus = {
  state: "idle",
  message: "Container ready, waiting for job trigger",
  env: {
    R2_ENDPOINT: process.env.R2_ENDPOINT ? "set" : "NOT SET",
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ? "set" : "NOT SET",
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ? "set" : "NOT SET",
    R2_BUCKET: process.env.R2_BUCKET || "mtgink-cdn",
    SUPABASE_DB_URL: process.env.SUPABASE_DB_URL ? "set" : "NOT SET",
    OUTPUT_DIR: process.env.OUTPUT_DIR || "R2",
  },
};

let jobRunning = false;

// ── HTTP server (port 8080) — status + job trigger ──────

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost:8080");

  // POST /run?job=images|tags|prices — trigger a job
  if (req.method === "POST" && url.pathname === "/run") {
    if (jobRunning) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Job already running", status }));
      return;
    }

    const jobType = url.searchParams.get("job") || "images";
    const setCodes = url.searchParams.get("sets") || undefined;
    const force = url.searchParams.get("force") === "1";

    console.log(`Job triggered via HTTP: ${jobType}`);
    status.job = jobType;

    // Start the job asynchronously
    jobRunning = true;
    runJob(jobType, { setCodes, force }).catch(async (err) => {
      console.error(`Job ${jobType} failed:`, err);
      status.state = "error";
      status.error = String(err);
      status.message = `Job ${jobType} failed: ${(err as Error).message}`;
      // Log failure to DB
      try {
        const errClient = new pg.Client(process.env.SUPABASE_DB_URL);
        await errClient.connect();
        await errClient.query(
          `INSERT INTO job_runs (job_type, status, message) VALUES ($1, 'failed', $2)`,
          [jobType, `${(err as Error).message}`]
        );
        await errClient.end();
      } catch {}
    }).finally(() => {
      jobRunning = false;
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ started: jobType, setCodes, force }));
    return;
  }

  // GET / — return status
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(status, null, 2));
});

server.listen(8080, () => {
  console.log("Container ready on port 8080");
});

// ── S3 client ───────────────────────────────────────────

let s3Client: any = null;
let s3Commands: any = {};

async function getS3() {
  if (!s3Client) {
    const s3 = await import("@aws-sdk/client-s3");
    s3Commands = {
      PutObjectCommand: s3.PutObjectCommand,
      HeadObjectCommand: s3.HeadObjectCommand,
      GetObjectCommand: s3.GetObjectCommand,
    };
    s3Client = new s3.S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return { client: s3Client, ...s3Commands };
}

// ── Helpers ──────────────────────────────────────────────

interface Printing {
  set_code: string;
  collector_number: string;
  image_version: string | null;
  image_uris: {
    art_crop?: string;
    normal?: string;
    [key: string]: string | undefined;
  } | null;
}

interface Job {
  set_code: string;
  collector_number: string;
  image_type: "art_crop" | "normal";
  image_version: string | null;
  url: string;
}

// Manifest maps R2 key → image_version for fast skip checks
type Manifest = Record<string, string>;

function r2Key(
  setCode: string,
  collectorNumber: string,
  imageType: string
): string {
  return `${setCode}/${collectorNumber}_${imageType}.jpg`;
}

async function downloadBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "MTGInk/1.0 (card art popularity tracker)",
      },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function uploadToR2(key: string, data: Buffer): Promise<boolean> {
  try {
    const { client, PutObjectCommand } = await getS3();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET || "mtgink-cdn",
        Key: key,
        Body: data,
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable", // 1 year, versioned URLs
      })
    );
    return true;
  } catch (err) {
    console.error(`  [R2] Failed to upload ${key}: ${(err as Error).message}`);
    return false;
  }
}

async function existsInR2(key: string): Promise<boolean> {
  try {
    const { client, HeadObjectCommand } = await getS3();
    await client.send(
      new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET || "mtgink-cdn",
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

async function loadManifest(): Promise<Manifest> {
  try {
    const { client, GetObjectCommand } = await getS3();
    const resp = await client.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET || "mtgink-cdn",
        Key: "_manifest.json",
      })
    );
    const body = await resp.Body?.transformToString();
    if (body) {
      const manifest = JSON.parse(body) as Manifest;
      console.log(`  Loaded manifest with ${Object.keys(manifest).length} entries`);
      return manifest;
    }
  } catch {
    console.log("  No existing manifest found, starting fresh");
  }
  return {};
}

async function saveManifest(manifest: Manifest): Promise<void> {
  const body = JSON.stringify(manifest);
  const outputDir = process.env.OUTPUT_DIR || null;
  if (outputDir) {
    await writeFile(path.join(outputDir, "_manifest.json"), body);
    console.log(`Manifest written to ${outputDir}/_manifest.json`);
  } else {
    try {
      const { client, PutObjectCommand } = await getS3();
      await client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET || "mtgink-cdn",
          Key: "_manifest.json",
          Body: body,
          ContentType: "application/json",
        })
      );
      console.log(`Manifest written to R2 (${Object.keys(manifest).length} entries)`);
    } catch (err) {
      console.error("Failed to write manifest to R2:", (err as Error).message);
    }
  }
}

async function writeLocal(
  outputDir: string,
  key: string,
  data: Buffer
): Promise<boolean> {
  const filePath = path.join(outputDir, key);
  mkdirSync(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
  return true;
}

// ── Job processing ──────────────────────────────────────

async function processJob(
  job: Job,
  outputDir: string | null,
  force: boolean,
  manifest: Manifest
): Promise<{ uploaded: number; skipped: number; failed: number }> {
  const key = r2Key(job.set_code, job.collector_number, job.image_type);

  // Check manifest first (fastest — no network call)
  if (!force && job.image_version) {
    if (manifest[key] === job.image_version) {
      return { uploaded: 0, skipped: 1, failed: 0 };
    }
  }

  // Fallback: check if exists (for images without version info, or not in manifest yet)
  if (!force) {
    let exists = false;
    if (outputDir) {
      exists = existsSync(path.join(outputDir, key));
    } else {
      exists = await existsInR2(key);
    }
    if (exists) {
      // Backfill manifest so future runs skip via manifest instead of HEAD
      if (job.image_version) {
        manifest[key] = job.image_version;
      }
      return { uploaded: 0, skipped: 1, failed: 0 };
    }
  }

  // Download from Scryfall
  const buffer = await downloadBuffer(job.url);
  if (!buffer) {
    return { uploaded: 0, skipped: 0, failed: 1 };
  }

  // Upload to R2 or write locally
  const ok = outputDir
    ? await writeLocal(outputDir, key, buffer)
    : await uploadToR2(key, buffer);
  if (ok) {
    // Record in manifest
    if (job.image_version) {
      manifest[key] = job.image_version;
    }
    return { uploaded: 1, skipped: 0, failed: 0 };
  }
  return { uploaded: 0, skipped: 0, failed: 1 };
}

// ── Tag import job ───────────────────────────────────────

interface ScryfallTag {
  id: string;
  label: string;
  description?: string;
  illustration_ids?: string[];
  oracle_ids?: string[];
}

async function importTags() {
  const startTime = Date.now();
  console.log("MTG Ink tag import starting");

  status.state = "loading";
  status.message = "Downloading tags from Scryfall";

  const endpoints = {
    illustration: "https://api.scryfall.com/private/tags/illustration",
    oracle: "https://api.scryfall.com/private/tags/oracle",
  };

  const headers = {
    "User-Agent": "MTGInk/1.0 (card art popularity tracker)",
    Accept: "application/json",
  };

  // Download both tag files
  const tagData: { type: string; tags: ScryfallTag[] }[] = [];
  for (const [type, url] of Object.entries(endpoints)) {
    console.log(`  Downloading ${type} tags...`);
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Failed to fetch ${type} tags: ${resp.status}`);
    const tags = (await resp.json()) as ScryfallTag[];
    console.log(`  Got ${tags.length} ${type} tags`);
    tagData.push({ type, tags });
  }

  // Connect to database
  status.state = "processing";
  status.message = "Importing tags to database";
  const client = new pg.Client(process.env.SUPABASE_DB_URL);
  await client.connect();

  let totalTags = 0;
  let totalAssoc = 0;

  for (const { type, tags } of tagData) {
    console.log(`  Importing ${type} tags...`);

    // Batch upsert tags
    const BATCH = 500;
    for (let i = 0; i < tags.length; i += BATCH) {
      const batch = tags.slice(i, i + BATCH);
      const values: string[] = [];
      const params: (string | null)[] = [];
      batch.forEach((tag, j) => {
        const offset = j * 4;
        values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
        params.push(tag.id, tag.label, type, tag.description || null);
      });
      await client.query(
        `INSERT INTO tags (tag_id, label, type, description) VALUES ${values.join(", ")}
         ON CONFLICT (tag_id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description`,
        params
      );
    }
    totalTags += tags.length;

    // Batch insert associations
    const assocTable = type === "illustration" ? "illustration_tags" : "oracle_tags";
    const idField = type === "illustration" ? "illustration_id" : "oracle_id";

    // Clear existing associations for this type and re-insert
    await client.query(`DELETE FROM ${assocTable}`);

    let assocCount = 0;
    const assocBatch: [string, string][] = [];

    for (const tag of tags) {
      const ids = type === "illustration" ? tag.illustration_ids : tag.oracle_ids;
      if (!ids) continue;
      for (const id of ids) {
        assocBatch.push([id, tag.id]);
        if (assocBatch.length >= 5000) {
          await insertAssocBatch(client, assocTable, idField, assocBatch);
          assocCount += assocBatch.length;
          assocBatch.length = 0;

          status.message = `Importing ${type} tags: ${assocCount.toLocaleString()} associations`;
          if (assocCount % 50000 === 0) {
            console.log(`    ${assocCount.toLocaleString()} associations...`);
          }
        }
      }
    }
    if (assocBatch.length > 0) {
      await insertAssocBatch(client, assocTable, idField, assocBatch);
      assocCount += assocBatch.length;
    }

    totalAssoc += assocCount;
    console.log(`  ${tags.length} tags, ${assocCount.toLocaleString()} associations`);
  }

  // Update usage_count
  console.log("  Updating usage counts...");
  await client.query(`
    UPDATE tags t SET usage_count = (
      SELECT COUNT(*) FROM illustration_tags it WHERE it.tag_id = t.tag_id
    ) + (
      SELECT COUNT(*) FROM oracle_tags ot WHERE ot.tag_id = t.tag_id
    )
  `);

  await client.end();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s — ${totalTags} tags, ${totalAssoc.toLocaleString()} associations`);

  status.state = "done";
  status.message = `Tags imported in ${elapsed}s — ${totalTags} tags, ${totalAssoc.toLocaleString()} associations`;
  status.elapsed = elapsed + "s";
}

async function insertAssocBatch(
  client: pg.Client,
  table: string,
  idField: string,
  rows: [string, string][]
): Promise<void> {
  const values: string[] = [];
  const params: string[] = [];
  rows.forEach((row, i) => {
    values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
    params.push(row[0], row[1]);
  });
  await client.query(
    `INSERT INTO ${table} (${idField}, tag_id) VALUES ${values.join(", ")}
     ON CONFLICT DO NOTHING`,
    params
  );
}

// ── Price import job ────────────────────────────────────

interface ScryfallPriceCard {
  id: string;
  prices: {
    usd: string | null;
    usd_foil: string | null;
    usd_etched: string | null;
    eur: string | null;
    eur_foil: string | null;
    tix: string | null;
  };
  purchase_uris?: {
    tcgplayer?: string;
    cardmarket?: string;
    cardhoarder?: string;
  };
}

interface PriceRow {
  scryfall_id: string;
  marketplace_id: number;
  product_url: string | null;
  is_foil: boolean;
  market_price: number;
  currency: string;
}

async function importPrices() {
  const startTime = Date.now();
  console.log("MTG Ink price import starting");

  status.state = "loading";
  status.message = "Loading printings from database";

  const client = new pg.Client(process.env.SUPABASE_DB_URL);
  await client.connect();

  // Get marketplace IDs
  const { rows: marketplaces } = await client.query<{ id: number; name: string }>(
    "SELECT id, name FROM marketplaces WHERE is_active = TRUE"
  );
  const mpMap = Object.fromEntries(marketplaces.map((m) => [m.name, m.id]));
  console.log(`  Marketplaces: ${marketplaces.map((m) => m.name).join(", ")}`);

  // Get scryfall_ids for printings likely to have prices
  // Skip tokens, art series, and digital-only sets
  const { rows: printings } = await client.query<{ scryfall_id: string }>(
    `SELECT p.scryfall_id FROM printings p
     JOIN sets s ON p.set_code = s.set_code
     WHERE s.set_type NOT IN ('token', 'memorabilia', 'vanguard', 'minigame')
       AND s.digital = FALSE
       AND (p.tcgplayer_id IS NOT NULL OR p.cardmarket_id IS NOT NULL)`
  );
  const scryfallIds = printings.map((p) => p.scryfall_id);
  console.log(`  ${scryfallIds.length} printings to fetch prices for (filtered from tokens/digital)`);

  // Log the run
  const {
    rows: [logRow],
  } = await client.query(
    "INSERT INTO price_update_log (marketplace, status) VALUES ('scryfall', 'running') RETURNING id"
  );
  const logId = logRow.id;

  // Process in batches of 75 (Scryfall collection API limit)
  status.state = "processing";
  const COLLECTION_BATCH = 75;
  const DB_BATCH = 1000;
  let totalPrices = 0;
  let cardsWithPrices = 0;
  let notFound = 0;
  let batchesDone = 0;
  const totalBatches = Math.ceil(scryfallIds.length / COLLECTION_BATCH);
  const pendingRows: PriceRow[] = [];

  for (let i = 0; i < scryfallIds.length; i += COLLECTION_BATCH) {
    const batch = scryfallIds.slice(i, i + COLLECTION_BATCH);

    // Call Scryfall collection API
    const resp = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MTGInk/1.0 (card art popularity tracker)",
      },
      body: JSON.stringify({
        identifiers: batch.map((id) => ({ id })),
      }),
    });

    if (!resp.ok) {
      console.error(`  Scryfall API error: ${resp.status} — skipping batch ${batchesDone + 1}`);
      batchesDone++;
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }

    const data = (await resp.json()) as {
      data: ScryfallPriceCard[];
      not_found: unknown[];
    };

    notFound += data.not_found?.length || 0;

    // Extract price rows
    for (const card of data.data) {
      if (!card.prices) continue;
      let hasPrices = false;

      // TCGPlayer (USD)
      if (mpMap.tcgplayer) {
        if (card.prices.usd) {
          pendingRows.push({
            scryfall_id: card.id,
            marketplace_id: mpMap.tcgplayer,
            product_url: card.purchase_uris?.tcgplayer || null,
            is_foil: false,
            market_price: parseFloat(card.prices.usd),
            currency: "USD",
          });
          hasPrices = true;
        }
        if (card.prices.usd_foil) {
          pendingRows.push({
            scryfall_id: card.id,
            marketplace_id: mpMap.tcgplayer,
            product_url: card.purchase_uris?.tcgplayer || null,
            is_foil: true,
            market_price: parseFloat(card.prices.usd_foil),
            currency: "USD",
          });
          hasPrices = true;
        }
      }

      // Cardmarket (EUR)
      if (mpMap.cardmarket) {
        if (card.prices.eur) {
          pendingRows.push({
            scryfall_id: card.id,
            marketplace_id: mpMap.cardmarket,
            product_url: card.purchase_uris?.cardmarket || null,
            is_foil: false,
            market_price: parseFloat(card.prices.eur),
            currency: "EUR",
          });
          hasPrices = true;
        }
        if (card.prices.eur_foil) {
          pendingRows.push({
            scryfall_id: card.id,
            marketplace_id: mpMap.cardmarket,
            product_url: card.purchase_uris?.cardmarket || null,
            is_foil: true,
            market_price: parseFloat(card.prices.eur_foil),
            currency: "EUR",
          });
          hasPrices = true;
        }
      }

      if (hasPrices) cardsWithPrices++;
    }

    // Flush to DB when we have enough rows
    if (pendingRows.length >= DB_BATCH) {
      await upsertPriceBatch(client, pendingRows.splice(0, DB_BATCH));
      totalPrices += DB_BATCH;
    }

    batchesDone++;
    status.message = `Fetching prices: batch ${batchesDone}/${totalBatches} — ${cardsWithPrices} cards, ${totalPrices + pendingRows.length} prices`;
    status.elapsed = ((Date.now() - startTime) / 1000).toFixed(1) + "s";

    if (batchesDone % 100 === 0) {
      console.log(
        `  ${batchesDone}/${totalBatches} batches — ${cardsWithPrices} cards with prices, ${notFound} not found`
      );
    }

    // Rate limit: 100ms between requests (Scryfall allows 10/s)
    await new Promise((r) => setTimeout(r, 100));
  }

  // Flush remaining rows
  if (pendingRows.length > 0) {
    await upsertPriceBatch(client, pendingRows);
    totalPrices += pendingRows.length;
  }

  // Update log
  await client.query(
    "UPDATE price_update_log SET completed_at = NOW(), cards_updated = $1, status = 'completed' WHERE id = $2",
    [cardsWithPrices, logId]
  );

  await client.end();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\nDone in ${elapsed}s — ${cardsWithPrices} cards, ${totalPrices} prices upserted, ${notFound} not found`
  );

  status.state = "done";
  status.message = `Prices imported in ${elapsed}s — ${cardsWithPrices} cards, ${totalPrices} prices`;
  status.elapsed = elapsed + "s";
}

async function upsertPriceBatch(
  client: pg.Client,
  rows: PriceRow[]
): Promise<void> {
  const values: string[] = [];
  const params: (string | number | boolean | null)[] = [];

  rows.forEach((row, j) => {
    const o = j * 6 + 1;
    values.push(
      `($${o}::uuid, $${o + 1}::int, $${o + 2}, $${o + 3}::boolean, $${o + 4}::numeric, $${o + 5})`
    );
    params.push(
      row.scryfall_id,
      row.marketplace_id,
      row.product_url,
      row.is_foil,
      row.market_price,
      row.currency
    );
  });

  await client.query(
    `INSERT INTO prices (scryfall_id, marketplace_id, product_url, is_foil, market_price, currency, condition, last_updated, source)
     VALUES ${values.map((v) => v.replace(/\)$/, ", 'NM', NOW(), 'scryfall')")).join(", ")}
     ON CONFLICT (scryfall_id, marketplace_id, condition, is_foil)
     DO UPDATE SET
       market_price = EXCLUDED.market_price,
       product_url = EXCLUDED.product_url,
       currency = EXCLUDED.currency,
       last_updated = EXCLUDED.last_updated`,
    params
  );
}

// ── Job dispatcher ───────────────────────────────────────

async function runJob(
  jobType: string,
  opts?: { setCodes?: string; force?: boolean }
) {
  const startTime = Date.now();
  console.log(`MTG Ink job starting: ${jobType}`);

  // Test internet connectivity
  status.state = "loading";
  status.message = "Testing internet connectivity";
  try {
    const testResp = await fetch("https://cloudflare.com", { method: "HEAD" });
    console.log(
      `  Internet check: ${testResp.status} (${testResp.ok ? "OK" : "FAIL"})`
    );
  } catch (err) {
    const msg = `Internet check FAILED: ${(err as Error).message}`;
    console.error(`  ${msg}`);
    status.state = "error";
    status.error = msg;
    return;
  }

  if (jobType === "tags") {
    await importTags();
    return;
  }

  if (jobType === "prices") {
    await importPrices();
    return;
  }

  // ── Images job ──
  const outputDir = process.env.OUTPUT_DIR || null;
  const concurrency = parseInt(process.env.CONCURRENCY || "8", 10);
  const force = opts?.force || false;
  const requestedSets = opts?.setCodes?.split(",").filter(Boolean);

  console.log(`  Output: ${outputDir || "R2"}`);
  console.log(`  Concurrency: ${concurrency}`);
  console.log(`  Force: ${force}`);
  if (requestedSets) {
    console.log(`  Sets: ${requestedSets.join(", ")}`);
  }

  // Load manifest from R2 (for fast skip checks)
  status.message = "Loading manifest";
  const manifest: Manifest = outputDir ? {} : await loadManifest();

  // Load printings from Supabase Postgres
  status.message = "Loading printings from database";
  console.log("  Connecting to Supabase Postgres...");

  const client = new pg.Client(process.env.SUPABASE_DB_URL);
  await client.connect();

  let query = `
    SELECT set_code, collector_number, image_uris, image_version
    FROM printings
    WHERE image_uris IS NOT NULL
  `;
  const params: string[] = [];

  if (requestedSets && requestedSets.length > 0) {
    query += ` AND set_code = ANY($1)`;
    params.push(requestedSets as any);
  }

  const { rows } = await client.query<Printing>(query, params);
  await client.end();

  console.log(`  Loaded ${rows.length} printings from database`);

  // Build jobs
  const jobs: Job[] = [];
  for (const row of rows) {
    const uris = row.image_uris;
    if (!uris) continue;
    if (uris.art_crop) {
      jobs.push({
        set_code: row.set_code,
        collector_number: row.collector_number,
        image_type: "art_crop",
        image_version: row.image_version,
        url: uris.art_crop,
      });
    }
    if (uris.normal) {
      jobs.push({
        set_code: row.set_code,
        collector_number: row.collector_number,
        image_type: "normal",
        image_version: row.image_version,
        url: uris.normal,
      });
    }
  }

  console.log(
    `\nProcessing ${jobs.length} images (${rows.length} printings)\n`
  );

  // Update status for processing
  status.state = "processing";
  status.message = `Processing ${jobs.length} images`;
  status.printings = rows.length;
  status.jobs = jobs.length;
  status.uploaded = 0;
  status.skipped = 0;
  status.failed = 0;

  // Log job start to Supabase
  const dbClient = new pg.Client(process.env.SUPABASE_DB_URL);
  await dbClient.connect();
  const { rows: [jobLog] } = await dbClient.query(
    `INSERT INTO job_runs (job_type, total_items, status, message)
     VALUES ('images', $1, 'running', 'Processing images')
     RETURNING id`,
    [jobs.length]
  );
  const jobLogId = jobLog.id;

  // Process with worker pool
  let totalUploaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let idx = 0;
  let lastManifestSave = Date.now();
  let lastDbLog = Date.now();
  const MANIFEST_SAVE_INTERVAL = 5 * 60 * 1000; // Save manifest every 5 min
  const DB_LOG_INTERVAL = 60 * 1000; // Log to DB every 60s

  async function worker() {
    while (idx < jobs.length) {
      const i = idx++;
      const job = jobs[i];
      const result = await processJob(job, outputDir, force, manifest);
      totalUploaded += result.uploaded;
      totalSkipped += result.skipped;
      totalFailed += result.failed;

      // Update status
      status.uploaded = totalUploaded;
      status.skipped = totalSkipped;
      status.failed = totalFailed;
      status.elapsed = ((Date.now() - startTime) / 1000).toFixed(1) + "s";

      const done = totalUploaded + totalSkipped + totalFailed;
      if (done % 500 === 0 || i === jobs.length - 1) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (done / ((Date.now() - startTime) / 1000)).toFixed(1);
        console.log(
          `  ${done}/${jobs.length} — ${totalUploaded} new, ${totalSkipped} exist, ${totalFailed} fail — ${elapsed}s (${rate}/s)`
        );
      }

      // Periodic manifest save (only from worker 0 to avoid races)
      const now = Date.now();
      if (!outputDir && now - lastManifestSave > MANIFEST_SAVE_INTERVAL) {
        lastManifestSave = now;
        saveManifest(manifest).catch((err) =>
          console.error("Periodic manifest save failed:", (err as Error).message)
        );
      }

      // Periodic DB progress log
      if (now - lastDbLog > DB_LOG_INTERVAL) {
        lastDbLog = now;
        const elapsed = ((now - startTime) / 1000).toFixed(1);
        dbClient.query(
          `UPDATE job_runs SET processed_items = $1, message = $2, updated_at = NOW()
           WHERE id = $3`,
          [done, `${totalUploaded} uploaded, ${totalSkipped} skipped, ${totalFailed} failed — ${elapsed}s`, jobLogId]
        ).catch(() => {});
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  // Final DB log
  const finalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  await dbClient.query(
    `UPDATE job_runs SET status = 'completed', processed_items = $1,
     message = $2, completed_at = NOW(), updated_at = NOW()
     WHERE id = $3`,
    [
      totalUploaded + totalSkipped + totalFailed,
      `${totalUploaded} uploaded, ${totalSkipped} skipped, ${totalFailed} failed — ${finalElapsed}s`,
      jobLogId,
    ]
  ).catch(() => {});
  await dbClient.end().catch(() => {});

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = {
    elapsed,
    totalPrintings: rows.length,
    totalJobs: jobs.length,
    uploaded: totalUploaded,
    skipped: totalSkipped,
    failed: totalFailed,
    timestamp: new Date().toISOString(),
  };
  console.log(
    `\nDone in ${elapsed}s — ${totalUploaded} uploaded, ${totalSkipped} skipped, ${totalFailed} failed`
  );
  console.log(JSON.stringify(summary, null, 2));

  // Update final status
  status.state = "done";
  status.message = `Done in ${elapsed}s — ${totalUploaded} uploaded, ${totalSkipped} skipped, ${totalFailed} failed`;
  status.elapsed = elapsed + "s";

  // Write manifest
  await saveManifest(manifest);

  // Write results
  if (outputDir) {
    const resultsPath = path.join(outputDir, "_scrape-results.json");
    await writeFile(resultsPath, JSON.stringify(summary, null, 2));
    console.log(`Results written to ${resultsPath}`);
  } else {
    try {
      const { client: s3, PutObjectCommand } = await getS3();
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET || "mtgink-cdn",
          Key: "_scrape-results.json",
          Body: JSON.stringify(summary, null, 2),
          ContentType: "application/json",
        })
      );
      console.log("Results written to R2: _scrape-results.json");
    } catch (err) {
      console.error(
        "Failed to write results to R2:",
        (err as Error).message
      );
    }
  }
}

// Container is ready — jobs are triggered via POST /run?job=<type>
console.log("MTG Ink container initialized, waiting for job trigger");
