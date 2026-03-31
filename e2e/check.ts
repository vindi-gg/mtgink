#!/usr/bin/env npx tsx
/**
 * Lightweight site checker — no browser, just HTTP requests.
 * Validates status codes and expected content on each route.
 *
 * Usage:
 *   npx tsx e2e/check.ts                    # default: http://localhost:3000
 *   BASE_URL=https://mtg.ink npx tsx e2e/check.ts
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

interface Route {
  path: string;
  status?: number; // expected status, default 200
  contains?: string[]; // strings that must appear in the HTML
  notContains?: string[]; // strings that must NOT appear
}

const routes: Route[] = [
  // Static pages
  { path: "/", contains: ["MTG Ink"] },
  { path: "/db", contains: ["Database"] },
  { path: "/db/expansions", contains: ["Expansions"] },
  { path: "/db/cards", contains: ["Cards"] },
  { path: "/db/tribes", contains: ["Tribes"] },
  { path: "/db/tags", contains: ["Tags"] },
  { path: "/db/art-tags", contains: ["Tags"] },
  { path: "/artists", contains: ["Artists"] },
  { path: "/history", contains: ["History"] },

  // Dynamic pages
  { path: "/card/lightning-bolt", contains: ["Lightning Bolt"] },
  { path: "/card/counterspell", contains: ["Counterspell"] },
  { path: "/db/expansions/mh3", contains: ["Modern Horizons 3"] },
  { path: "/db/expansions/woe", contains: ["Wilds of Eldraine"] },
  { path: "/artists/greg-staples", contains: ["Greg Staples"] },
  { path: "/artists/kev-walker", contains: ["Kev Walker"] },
  { path: "/db/tribes/dragon", contains: ["Dragon"] },
  { path: "/db/tribes/goblin", contains: ["Goblin"] },

  // Showdown pages
  { path: "/showdown", status: 307 }, // redirects to /showdown/remix
  { path: "/showdown/remix", contains: ["Remix"] },
  { path: "/showdown/vs", contains: ["VS"] },
  { path: "/showdown/gauntlet", contains: ["Gauntlet"] },
  { path: "/ink", contains: ["Remix"] },
  { path: "/ink/gauntlet", contains: ["Gauntlet"] },

  // API routes
  { path: "/api/search?q=lightning", contains: ["Lightning"] },

  // 404
  { path: "/this-does-not-exist-abc123", status: 404 },
];

interface Result {
  path: string;
  pass: boolean;
  status: number;
  expected: number;
  errors: string[];
  ms: number;
}

async function checkRoute(route: Route): Promise<Result> {
  const expectedStatus = route.status ?? 200;
  const errors: string[] = [];
  const start = Date.now();

  try {
    const res = await fetch(`${BASE}${route.path}`, {
      redirect: "manual",
      headers: { "User-Agent": "MTGInk-SiteChecker/1.0" },
    });
    const ms = Date.now() - start;
    const status = res.status;

    if (status !== expectedStatus) {
      errors.push(`status ${status}, expected ${expectedStatus}`);
    }

    // Only check body content for 200 responses
    if (expectedStatus === 200 && status === 200) {
      const html = await res.text();

      for (const text of route.contains ?? []) {
        if (!html.includes(text)) {
          errors.push(`missing: "${text}"`);
        }
      }
      for (const text of route.notContains ?? []) {
        if (html.includes(text)) {
          errors.push(`unexpected: "${text}"`);
        }
      }

      // Check for server error indicators
      if (html.includes("Internal Server Error") || html.includes("Application error")) {
        errors.push("page contains error message");
      }
    }

    return { path: route.path, pass: errors.length === 0, status, expected: expectedStatus, errors, ms };
  } catch (err) {
    return {
      path: route.path,
      pass: false,
      status: 0,
      expected: expectedStatus,
      errors: [`fetch failed: ${(err as Error).message}`],
      ms: Date.now() - start,
    };
  }
}

async function main() {
  console.log(`\nChecking ${routes.length} routes against ${BASE}\n`);

  const results: Result[] = [];

  // Run 5 at a time
  for (let i = 0; i < routes.length; i += 5) {
    const batch = routes.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(checkRoute));
    results.push(...batchResults);

    for (const r of batchResults) {
      const icon = r.pass ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
      const timing = `\x1b[90m${r.ms}ms\x1b[0m`;
      if (r.pass) {
        console.log(`  ${icon} ${r.path} (${r.status}) ${timing}`);
      } else {
        console.log(`  ${icon} ${r.path} (${r.status}) ${timing}`);
        for (const err of r.errors) {
          console.log(`    \x1b[31m→ ${err}\x1b[0m`);
        }
      }
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const totalMs = results.reduce((sum, r) => sum + r.ms, 0);

  console.log(`\n${passed} passed, ${failed} failed (${totalMs}ms total)\n`);

  if (failed > 0) process.exit(1);
}

main();
