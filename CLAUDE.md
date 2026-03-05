# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MTG Ink is a web application for Magic: The Gathering focused on discovering and ranking the most popular art versions for each card. Users vote on head-to-head art matchups, and cards are ranked via ELO ratings.

**Stack:**
- **Frontend/Backend**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Card Data**: SQLite via better-sqlite3 (read-only, `data/mtgink.db`)
- **Votes/Ratings**: SQLite (read-write, `data/mtgink_votes.db`)
- **Images**: Local filesystem (~206K images served via API route)

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
python3 scripts/download_bulk.py    # Download bulk JSON from Scryfall (~700MB)
python3 scripts/import_data.py      # Import into SQLite database
python3 scripts/download_images.py  # Download card images (~19GB)
python3 scripts/import_tags.py      # Download + import Scryfall Tagger tags
```

## Web App Architecture

### Pages (App Router)
- `/` — Landing page with links to Compare and Browse
- `/compare` — Head-to-head art voting (optional `?oracle_id=` filter)
- `/browse` — Search for cards with multiple art versions
- `/card/[slug]` — Card detail: all illustrations ranked by ELO, all printings

### API Routes
- `GET /api/search?q=` — Search cards by name (returns cards with 2+ illustrations)
- `GET /api/compare?oracle_id=` — Get random comparison pair
- `POST /api/vote` — Record vote, return updated ratings + next pair
- `GET /api/card/[slug]` — Card detail with illustrations, ratings, printings
- `GET /api/images/[...path]` — Serve card images from `data/images/` with 1yr cache

### Key Source Files
```
web/src/
├── app/                    # Next.js App Router pages + API routes
├── components/
│   ├── Navbar.tsx          # Sticky nav with active link highlighting
│   ├── CardSearch.tsx      # Debounced search with live results
│   ├── ComparisonView.tsx  # Voting UI (click or arrow keys, S to skip)
│   ├── CardImage.tsx       # Image with loading skeleton
│   ├── ArtGallery.tsx      # Grid of ranked art cards
│   └── ArtCard.tsx         # Single art card with ELO badge
└── lib/
    ├── db.ts               # Card data DB connection (read-only singleton)
    ├── votes-db.ts         # Votes DB connection + schema init
    ├── queries.ts          # All database queries (search, compare, vote, etc.)
    ├── elo.ts              # ELO calculation (K=32, default 1500)
    ├── types.ts            # TypeScript interfaces
    └── image-utils.ts      # URL helpers for card images
```

### Data Flow
- **Card data**: Pages/API → `queries.ts` → `db.ts` → `data/mtgink.db` (read-only)
- **Votes**: `POST /api/vote` → `recordVote()` → `calculateElo()` → `data/mtgink_votes.db`
- **Images**: `GET /api/images/...` → `fs.readFileSync()` from `data/images/`
- **Sessions**: localStorage `mtgink_session_id` (random hex, no auth yet)

## Data Pipeline

### Card Database: `data/mtgink.db` (SQLite, ~656 MB)
- **sets** (1,029 rows) — All MTG sets/products
- **oracle_cards** (36,923 rows) — One row per unique logical card
- **printings** (112,608 rows) — One row per English printing/version
- **card_faces** (9,623 rows) — For multi-face cards (transform, split, modal DFC)
- **tags** (16,579 rows) — Scryfall Tagger tag definitions (illustration + oracle)
- **illustration_tags** (1,173,911 rows) — Maps illustration_id → tag_id (art tags)
- **oracle_tags** (498,329 rows) — Maps oracle_id → tag_id (function tags)

### Votes Database: `data/mtgink_votes.db` (SQLite)
- **art_ratings** — ELO ratings per illustration (default 1500, K=32)
- **votes** — Raw vote log with session tracking
- **popularity_signals** — Future extensibility for other ranking signals

### Key ID Systems
- **scryfall_id** (UUID): Primary key per printing — unique to each specific version
- **oracle_id** (UUID): Groups all printings of the same logical card
- **illustration_id** (UUID): Groups printings sharing same artwork (47,997 unique)
- **tcgplayer_id** (integer): TCGPlayer product ID (96,743 cards have one)

### Images: `data/images/{set_code}/`
- `{collector_number}_normal.jpg` (488×680) — Standard card image
- `{collector_number}_art_crop.jpg` — Just the artwork
- ~206K images, ~19GB total

### TCGPlayer Integration
- No API key needed — Scryfall includes `tcgplayer_id` and USD pricing
- Affiliate links: `https://www.tcgplayer.com/product/{tcgplayer_id}`

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

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary.
- **API-First**: Every feature should be accessible via the API. Web UI consumes the same API.

## Conventions

- Business logic belongs in `lib/` — not in API routes or page components
- API routes are thin: validate input, call query functions, return JSON
- TypeScript for all code, strict mode enabled
- Path alias `@/*` maps to `web/src/*`
- Tailwind CSS 4 with custom theme in `globals.css` (dark theme, amber accent)
