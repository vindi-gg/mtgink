# Unified Scraper: Same Container Local + Prod

## Problem
Two separate implementations for data/image scraping:
- **Prod**: Cloudflare Worker container (TypeScript, Supabase Postgres, R2 uploads)
- **Local**: Python scripts (Postgres, local filesystem)

Same logic, different languages, different storage backends. Bugs fixed in one don't fix the other.

## Goal
Run the same container locally and on prod. One codebase, one test surface.

## Approach
1. Make the worker container configurable for storage backend:
   - R2 mode (prod): uploads to Cloudflare R2
   - Filesystem mode (local): writes to `data/images/`
2. Add a `docker-compose.yml` that runs the container locally:
   - Mounts `data/images/` as a volume
   - Connects to local Supabase (127.0.0.1:54322)
   - Sets env vars for filesystem mode
3. Admin "Scrape Cards" button calls the local container via HTTP (same interface as prod)
4. Retire Python scripts for scraping (keep as reference/one-off tools)

## Key Changes
- `workers/images/container_src/src/index.ts` — add filesystem storage adapter alongside R2
- `docker-compose.yml` — service definition for local scraper container
- `web/src/app/api/admin/worker/route.ts` — local mode hits `http://localhost:8080` instead of Python scripts

## Blockers
- Container currently requires Cloudflare-specific APIs (Durable Objects, Container class)
- Need to extract the core scraping logic into a standalone HTTP server that works outside CF
- R2 client vs filesystem write abstraction
