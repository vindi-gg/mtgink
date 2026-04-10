# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MTG Ink is a web application for Magic: The Gathering focused on discovering and ranking the most popular art versions for each card. Users vote on head-to-head art matchups, and cards are ranked via ELO ratings.

**Stack:**
- **Frontend/Backend**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: Supabase Postgres (all card data, votes, ratings, prices)
- **Auth**: Supabase Auth (Google, Discord, email/password)
- **Images**: Cloudflare R2 (`cdn.mtg.ink`) + local filesystem for dev

## Development Commands

```bash
cd web
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint
```

### Data Pipeline (Python scripts, run from project root)
```bash
python3 scripts/download_bulk.py          # Download bulk JSON from Scryfall (~700MB)
python3 scripts/import_data.py            # Import into local SQLite (dev only)
python3 scripts/import_data_postgres.py   # Import into Supabase Postgres (production)
python3 scripts/import_prices.py          # Seed prices from Scryfall data
python3 scripts/download_images.py        # Download card images (~19GB)
python3 scripts/import_tags.py            # Download + import Scryfall Tagger tags
python3 scripts/migrate_votes.py          # One-time: SQLite votes → Postgres
```

## Web App Architecture

### Pages (App Router)
- `/` — Landing page with links to Compare and Browse
- `/ink` — Same-card art comparison (mirror mode)
- `/clash` — Cross-card art comparison (VS mode)
- `/compare` — Head-to-head art voting (optional `?oracle_id=` filter)
- `/bracket` — 32-card single-elimination art tournament
- `/browse` — Search for cards with multiple art versions
- `/card/[slug]` — Card detail: all illustrations ranked by ELO, all printings
- `/db/expansions` — Browse sets, `/db/expansions/[set_code]` — Set detail
- `/deck/*` — Deck management (import, art selection, purchase list)

### API Routes
- `GET /api/search?q=` — Search cards by name (returns cards with 2+ illustrations)
- `GET /api/compare?oracle_id=` — Get random comparison pair
- `POST /api/vote` — Record vote, return updated ratings + next pair
- `GET /api/card/[slug]` — Card detail with illustrations, ratings, printings
- `GET /api/bracket` — Random bracket cards
- `GET/POST /api/deck` — Deck CRUD
- `POST /api/deck/import` — Import decklist (paste or Moxfield URL)
- `GET /api/deck/purchases` — User purchase list
- `GET /api/favorites` — User favorites
- `GET /api/images/[...path]` — Serve card images (local dev only)

### Key Source Files
```
web/src/
├── app/                    # Next.js App Router pages + API routes
├── components/
│   ├── Navbar.tsx          # Sticky nav with active link highlighting
│   ├── CardSearch.tsx      # Debounced search with live results
│   ├── ComparisonView.tsx  # Voting UI (click or arrow keys, S to skip)
│   ├── BracketView.tsx     # Tournament bracket UI
│   ├── DeckView.tsx        # Deck card list with art selection
│   ├── CardImage.tsx       # Image with loading skeleton
│   ├── ArtGallery.tsx      # Grid of ranked art cards
│   └── ArtCard.tsx         # Single art card with ELO badge
└── lib/
    ├── supabase/
    │   ├── client.ts       # Browser Supabase client (auth)
    │   ├── server.ts       # Server Supabase client (auth + RLS)
    │   └── admin.ts        # Service role client (bypasses RLS)
    ├── queries.ts          # All card/vote queries (async, Supabase)
    ├── deck-queries.ts     # Deck CRUD queries (async, Supabase)
    ├── bracket.ts          # Bracket card queries (async, Supabase)
    ├── price-queries.ts    # Multi-marketplace price queries
    ├── elo.ts              # ELO calculation (K=32 auth, K=16 anon)
    ├── types.ts            # TypeScript interfaces
    └── image-utils.ts      # URL helpers for card images
```

### Data Flow
- **Card data**: Pages/API → `queries.ts` → Supabase Postgres (via `getAdminClient()`)
- **Votes**: `POST /api/vote` → `recordVote()` → Postgres stored procedure (atomic ELO update)
- **Auth-scoped data**: Uses server client with RLS (favorites, decks, vote history)
- **Images**: Cloudflare R2 (`cdn.mtg.ink`) in production, `/api/images/` for local dev
- **Sessions**: localStorage `mtgink_session_id` (anonymous), Supabase Auth (logged in)

## Database (Supabase Postgres)

### Card Data Tables
- **sets** (1,029 rows) — All MTG sets/products
- **oracle_cards** (36,923 rows) — One row per unique logical card (includes pre-computed `slug`)
- **printings** (112,608 rows) — One row per English printing/version
- **card_faces** (9,623 rows) — For multi-face cards (transform, split, modal DFC)
- **tags** (16,579 rows) — Scryfall Tagger tag definitions
- **illustration_tags** (1,173,911 rows) — Maps illustration_id → tag_id
- **oracle_tags** (498,329 rows) — Maps oracle_id → tag_id

### User Data Tables
- **art_ratings** — ELO ratings per illustration (default 1500)
- **votes** — Raw vote log with session tracking and `vote_source`
- **favorites** — User-scoped illustration favorites
- **decks** / **deck_cards** — Saved decks with art selection

### Pricing Tables
- **marketplaces** — TCGPlayer, Cardmarket, Manapool
- **prices** — Per-printing prices across marketplaces
- **best_prices** (VIEW) — Cheapest NM non-foil per printing
- **price_update_log** — Tracks update runs

### Stored Procedures
- `get_illustrations_for_card(oracle_id)` — Illustrations with best representative printing
- `record_vote(...)` — Atomic vote + ELO update transaction
- `get_random_bracket_cards(count)` — Random selection for brackets
- `get_card_cache()` — Bulk load for in-memory JS cache

### Key ID Systems
- **scryfall_id** (UUID): Primary key per printing
- **oracle_id** (UUID): Groups all printings of the same logical card
- **illustration_id** (UUID): Groups printings sharing same artwork (47,997 unique)
- **slug** (TEXT): Pre-computed URL slug on oracle_cards (eliminates N+1 queries)

### RLS Policies
- Card data + prices: public read
- art_ratings: public read, service_role write
- votes: anyone can insert, users read own
- favorites, decks, deck_cards: user-scoped via `auth.uid()`

### Supabase Migrations
```
supabase/migrations/
├── 001_card_data_tables.sql
├── 002_votes_user_tables.sql
├── 003_pricing_system.sql
├── 004_rls_policies.sql
└── 005_stored_procedures.sql
```

## Infrastructure
- **Hosting**: Vercel (Next.js)
- **Database**: Supabase Postgres (Pro tier)
- **CDN/WAF/DDoS**: Cloudflare (orange cloud proxy)
- **Images**: Cloudflare R2 at `cdn.mtg.ink`
- **Cache rules**: Images cached 30d on CF edge, API bypasses CF cache, pages respect origin headers

## Deployment

### Web (Next.js → Vercel)
- `git push origin main` triggers automatic Vercel deploy
- ISR pages (`revalidate = 60`) serve stale content until cache expires — wait up to 60s after deploy for fresh data
- Force fresh ISR: visit the page to trigger revalidation

### Database Migrations (Supabase)
Migrations live in `supabase/migrations/`. Run them manually via psql:
```bash
export SUPABASE_DB_URL=$(grep SUPABASE_DB_URL web/.env.local | cut -d= -f2-)
/opt/homebrew/opt/libpq/bin/psql "$SUPABASE_DB_URL" -f supabase/migrations/<filename>.sql
```
- `psql` is installed via `brew install libpq` (not in PATH by default, use full path above)
- No `exec_sql` RPC on Supabase — must use psql directly
- No Supabase CLI `migration up` — the `SUPABASE_DB_URL` format doesn't work with it
- Always test migrations locally or review SQL before running against prod

## Env Vars
```
NEXT_PUBLIC_SUPABASE_URL=...       # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=...  # Public anon key (RLS-protected)
SUPABASE_SERVICE_ROLE_KEY=...      # Server writes bypassing RLS
SUPABASE_DB_URL=...                # Direct Postgres for Python scripts
```

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Plans go in `.claude/plans/<feature-name>.md`

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `.claude/lessons/lessons.md`
- Write rules for yourself that prevent the same mistake
- Review lessons at session start for relevant project context

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Run tests, check logs, verify data flow
- For frontend: rebuild assets and verify in browser

### 5. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors — then resolve them
- Go fix failing tasks without being told how

## Task Management

1. **Plan First**: Write plan to `.claude/plans/<name>.md`
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Capture Lessons**: Update `.claude/lessons/lessons.md` after corrections

### File Locations
```
.claude/
├── plans/           # Implementation plans for features
├── lessons/         # Accumulated learnings
│   └── lessons.md   # Patterns and mistakes to avoid
└── skills/          # Custom skills/commands
```

## Authorization Required Every Time: Prod DB, Git Commits, Git Push

**Production DB writes, git commits, and git pushes are NEVER auto-approved,
no matter what.**

Every one of these actions requires a fresh, explicit "yes do it" from the
user BEFORE it runs, every single time.

### What requires fresh approval

- **Production Supabase writes**: any command that can modify prod state,
  including:
  - SQL migrations against `SUPABASE_DB_URL` from `web/.env.local`
  - Manual `psql` commands that aren't pure `SELECT` (UPDATE, DELETE, ALTER,
    CREATE, DROP, INSERT, TRUNCATE, GRANT, REVOKE, etc.)
  - `supabase db push`, `supabase db reset`, or anything that targets the
    prod project via the management API / CLI
  - Any script in `scripts/` that writes to prod (e.g.
    `import_data_postgres.py`, `import_prices.py`, `import_tags_postgres.py`,
    `migrate_votes.py`)

- **Git commits**: `git commit` of any kind — feature work, fixes, docs,
  merges, reverts, amends. All of them.

- **Git pushes**: `git push` to any remote branch, including the branch
  you're currently on. Merging branches locally and then pushing counts.
  Creating a new remote branch counts. Force-pushing always requires
  approval AND the user must explicitly say "force push".

### Prior approval does not carry over

If the user said "commit and push this fix" and you finish, the authorization
is used up. The next commit needs a new approval. Same for prod migrations:
"go ahead and run migrations 069, 070, 071" does NOT authorize migration 072
ten minutes later, even if it looks trivially safe.

### What does NOT need fresh approval

- Local-only operations: running migrations against
  `web/.env.development.local` (the `docker exec supabase_db_mtgink psql ...`
  setup), editing files, running the dev server, installing deps, reading
  from prod (SELECT-only queries).
- `git status`, `git diff`, `git log`, `git branch` — read-only git.
- Staging changes with `git add` (reversible, not visible to anyone).

### When in doubt

Show the exact command/SQL/diff and ask. A 10-second pause is cheap; an
unauthorized prod change or an unwanted commit is not.

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary.
- **API-First**: Every feature should be accessible via the API. Web UI consumes the same API.

## Conventions

- Business logic belongs in `lib/` — not in API routes or page components
- API routes are thin: validate input, call query functions, return JSON
- All query functions are **async** — return Promises, use `await`
- Use `getAdminClient()` for public data reads and server writes (bypasses RLS)
- Use `createClient()` from `supabase/server.ts` for user-scoped operations (respects RLS)
- TypeScript for all code, strict mode enabled
- Path alias `@/*` maps to `web/src/*`
- Tailwind CSS 4 with custom theme in `globals.css` (dark theme, amber accent)
