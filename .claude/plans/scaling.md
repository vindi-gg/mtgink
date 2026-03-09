# Scaling Plan

## Current Bottlenecks (at 10K+ concurrent users)

1. **SQLite + better-sqlite3 is synchronous** — blocks Node.js event loop on every DB call
2. **Images served through Node.js** — `fs.readFileSync()` in API route, 206K images / 19GB
3. **Single process** — can't utilize multiple cores, no horizontal scaling with file-based SQLite
4. **Write contention on votes** — SQLite WAL helps reads but writes serialize

## Full Stack Cost Estimates

### At 10K DAU

| Service | Tier | Monthly Cost |
|---------|------|-------------|
| Cloudflare R2 (images) | Pay-as-you-go | $2-5 |
| Supabase (auth + DB) | Pro | $25 |
| Vercel (hosting) | Pro | $20 |
| Upstash Redis (if needed) | Pay-as-you-go | $0-5 |
| Domain + Cloudflare DNS | Free tier | $0 |
| **Total** | | **~$50-55/mo** |

### At 100K DAU

| Service | Tier | Monthly Cost |
|---------|------|-------------|
| Cloudflare R2 (images) | Pay-as-you-go | $50-80 |
| Supabase (auth + DB) | Pro (may need compute add-on) | $25-50 |
| Vercel (hosting) | Pro (may hit function limits) | $20-40 |
| Upstash Redis | Pro | $10-30 |
| **Total** | | **~$105-200/mo** |

### At 1M DAU

| Service | Tier | Monthly Cost |
|---------|------|-------------|
| Cloudflare R2 (images) | Pay-as-you-go | $400-600 |
| Supabase (auth + DB) | Team/Enterprise | $200-500 |
| Vercel (hosting) | Enterprise | $200-400 |
| Upstash Redis | Enterprise | $50-100 |
| **Total** | | **~$850-1600/mo** |

## Service Breakdown

### 1. Cloudflare R2 — Images CDN

**What:** Move 206K images (19GB) off Node.js to R2 edge storage.

**Pricing:**
- Storage: $0.015/GB/mo → 19GB = $0.29/mo
- Class B reads: Free up to 10M/mo, then $0.36/million
- Class A writes: $4.50/million (one-time upload: $0.93)
- Egress: **Free** (vs S3 at $0.085/GB — saves hundreds/mo at scale)

**Implementation:**
- Upload `data/images/` to R2 bucket
- Custom domain or R2 public URL
- Update `image-utils.ts` to return CDN URLs instead of `/api/images/...`
- Keep image API route as local dev fallback
- Already have 1yr cache headers — browser caching cuts requests ~60%

### 2. Supabase — Auth + Postgres DB

**What:** Replace both SQLite databases with Supabase Postgres. Auth already planned.

**Pricing:**
- Free tier: 500MB DB, 50K MAU auth, 1GB storage
- Pro ($25/mo): 8GB DB, 100K MAU auth, 100GB storage, daily backups
- Compute add-ons: $0.01344/hr per unit if needed

**Card data (read-only, ~656MB):**
- Tables: `oracle_cards` (37K), `printings` (113K), `sets` (1K), `card_faces` (10K)
- Tags: `tags` (17K), `oracle_tags` (498K), `illustration_tags` (1.17M)
- Fits in Pro tier. Read-heavy, benefits from Postgres connection pooling (Supavisor)

**Votes data (read-write):**
- Tables: `art_ratings`, `votes`, `favorites`, `decks`, `deck_cards`
- Much smaller, write-heavy
- Postgres handles concurrent writes far better than SQLite

**Migration approach:**
- Export SQLite → import to Supabase Postgres
- Update `db.ts` and `votes-db.ts` to use Supabase client (async)
- All `queries.ts` functions become async
- API routes already async — just need `await` on query calls

### 3. Vercel — Hosting + Edge

**What:** Deploy Next.js on Vercel for auto-scaling serverless functions.

**Pricing:**
- Hobby (free): 100GB bandwidth, limited serverless execution
- Pro ($20/mo): 1TB bandwidth, more generous limits
- Function execution: 100GB-hrs (Pro), then $0.18/GB-hr

**Why Vercel:**
- Native Next.js support (they make it)
- Automatic edge caching for static pages
- ISR (Incremental Static Regeneration) for card detail pages
- Global CDN for the Next.js app itself
- Only viable after Postgres migration (SQLite needs filesystem)

**Caching strategy on Vercel:**
- Static pages (home, browse): build-time, cached at edge
- Card detail pages: ISR with ~60s revalidation
- Compare/vote: serverless functions, no caching
- API responses: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` for card data

### 4. Upstash Redis — Hot Path Caching (if needed)

**What:** Cache frequently-accessed data to reduce Postgres load.

**Pricing:**
- Free: 10K commands/day
- Pay-as-you-go: $0.2/100K commands
- Pro ($10/mo): 50K commands/day, global replication

**What to cache:**
- In-memory card cache (already done) — survives across serverless cold starts via Redis
- Popular card ratings (TTL ~60s)
- Comparison pair pre-generation (batch generate ahead of demand)
- Rate limiting for votes (prevent abuse)

**Only needed at 50K+ DAU.** Below that, Postgres + Vercel edge caching is sufficient.

## In-Memory Caching (already done)
- Card cache: all oracle_ids with type_line/colors/illustration_count loaded once into memory
- Random card selection uses JS array instead of `ORDER BY RANDOM()` SQL
- Eliminates the most expensive per-request query pattern
- Note: in serverless (Vercel), this cache is per-instance and lost on cold starts — Redis solves this

## Migration Path

| Step | Prereqs | Effort |
|------|---------|--------|
| 1. R2 for images | None | Low — afternoon |
| 2. Supabase Auth | Supabase project | Done (already set up) |
| 3. Votes + decks to Supabase Postgres | Step 2 | Medium — 1-2 days |
| 4. Card data to Supabase Postgres | Step 2 | Medium — 1-2 days |
| 5. Deploy to Vercel | Steps 3+4 | Low — hours |
| 6. Upstash Redis | Step 5 | Low — only if needed |

Steps 1-2 are independent and can happen in parallel. Steps 3-4 can be done together. Step 5 follows immediately. Step 6 is reactive — add it when you see latency climb.
