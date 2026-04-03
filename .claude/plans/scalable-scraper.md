# Scalable Scraper Architecture

## Phase 1: Smart Diff (NOW)
- Store `last_sync_at` in Cloudflare KV
- On hourly cron, only process printings with `created_at > last_sync_at`
- Typical run: 0-50 new printings instead of 224K
- Update `last_sync_at` after successful sync

## Phase 2: Cloudflare Queues (LATER)
- Producer worker diffs and enqueues image jobs
- Consumer workers download from Scryfall CDN → upload to R2 in parallel
- Auto-scaled, stateless, no container needed for images

## Phase 3: Streaming JSON (LATER)
- Replace `await resp.json()` with streaming parser for 400MB bulk data
- Process cards one at a time, batch DB inserts
- Flat memory usage regardless of data size

## Phase 4: Unified Local/Prod (LATER)
- Same container runs locally and on prod
- Filesystem adapter for local, R2 adapter for prod
- See `.claude/plans/unified-scraper.md`
