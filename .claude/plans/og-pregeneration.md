# OG Image Pre-generation Plan

## Current State
- **Default OG** (`/opengraph-image`): Static 5-strip art collage, edge-generated, no DB
- **Card OG** (`/card/[slug]/opengraph-image`): Dynamic, fetches card + illustration data, generates PNG on each request with 1-week ISR cache
- **Gauntlet OG** (`/gauntlet/result/[id]/opengraph-image`): Dynamic per result
- **Storage**: R2 bucket `mtgink-cdn` at `cdn.mtg.ink`
- **Worker**: Cloudflare Container worker (`mtgink-images`) with R2 upload, concurrency 8, 10m auto-sleep

## Goal
Pre-generate card OG images to R2 so social shares load instantly from CDN instead of triggering edge generation. Versioned URLs for cache busting.

## Architecture

### Storage
- R2 key pattern: `og/card/{slug}_v{version}.png`
- Version = unix timestamp of generation run (e.g. `og/card/counterspell_v1712448000.png`)
- Served via `cdn.mtg.ink/og/card/{slug}_v{version}.png`

### DB Tracking
New column on `oracle_cards`:
```sql
ALTER TABLE oracle_cards ADD COLUMN og_version BIGINT DEFAULT NULL;
```
- `NULL` = no pre-generated OG, use dynamic fallback
- Set to unix timestamp after successful upload

### Generation Flow
1. **New job type: `og`** added to existing worker/container pipeline
2. Container queries all card slugs from DB (or a batch range)
3. For each slug, fetches `https://mtg.ink/card/{slug}/opengraph-image`
4. Uploads PNG to R2 at `og/card/{slug}_v{timestamp}.png`
5. Updates `oracle_cards.og_version` in DB
6. Concurrency: 8 parallel fetches (matches existing image scraper)

### Batch Strategy
- ~37K cards, but only ~15K have 2+ illustrations (meaningful OG)
- At concurrency 8, ~2 sec per image = ~1 hour for 15K
- Split into multiple job invocations by slug range (a-d, e-j, k-p, q-z) for parallelism
- Or: `og?batch=1&total=4` parameters, container splits alphabetically
- 4 parallel batches = ~15 min total

### Serving
In `card/[slug]/page.tsx` `generateMetadata`:
```ts
// If pre-generated OG exists, use R2 URL
if (card.og_version) {
  const ogUrl = `https://cdn.mtg.ink/og/card/${card.slug}_v${card.og_version}.png`;
  return { ...metadata, openGraph: { ...og, images: [ogUrl] } };
}
// Otherwise, no card-specific OG — inherits default site OG from root opengraph-image.tsx
```

Delete `card/[slug]/opengraph-image.tsx` — dynamic per-card generation is replaced by pre-gen from R2, with root default as fallback.

### Refresh Schedule
- Manual trigger from admin panel (like other jobs)
- Optionally: weekly cron on the worker (Sunday night)
- Only regenerate cards where illustration data changed since last run (compare updated_at)

## Implementation Steps

### Phase 1: Serve from R2 when available
1. [ ] Migration: add `og_version` column to `oracle_cards`
2. [ ] Update `generateMetadata` in card page to use R2 URL when `og_version` is set
3. [ ] Default OG already set as fallback (done)

### Phase 2: Generation job
4. [ ] Add `og` job handler to container (`container_src/src/index.ts`)
5. [ ] Job fetches slugs from DB, hits Next.js OG route, uploads to R2
6. [ ] Update `oracle_cards.og_version` after each successful upload
7. [ ] Support batch params for parallel runs
8. [ ] Add "OG Images" button to admin panel jobs

### Phase 3: Cleanup & cron
9. [ ] Delete old versions from R2 when regenerating (or let R2 lifecycle rules handle)
10. [ ] Optional: weekly cron trigger for `og` job
11. [ ] Optional: incremental mode — only regenerate cards with changed illustrations

## Alternatives Considered
- **Generate in Next.js API route**: Would work but ties up Vercel serverless functions; container is better for bulk
- **Generate in worker directly (no Next.js)**: Would need to duplicate the OG rendering logic; hitting the existing route reuses code
- **Static export at build time**: 37K images at build = very slow deploys, not practical
