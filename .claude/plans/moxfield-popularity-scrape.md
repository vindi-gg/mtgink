# Moxfield Commander deck scrape — per-illustration popularity

## Goal

Build a per-illustration popularity signal from public Moxfield Commander
decks that distinguishes **"the user picked this art"** from **"Moxfield
defaulted them into it"**. Surface as a `Popular` sort that's actually
meaningful (today's sort = ELO, which is mostly noise: most illustrations
have 0 votes).

## Why Commander only

- Commander is the dominant format on Moxfield (probably >70% of public
  decks). Other formats give a thinner signal.
- Commander players actively curate art for their decks — exactly the
  population we want to learn from.
- Modern / Pioneer / Standard players mostly use the cheapest legal
  printing automatically. Their art "choices" are usually noise.

## Architecture

```
┌─────────────────┐   1/sec   ┌──────────────────────┐
│  discover.py    │──────────▶│ moxfield_scrape_queue│
│ (nightly cron)  │           │   status=pending     │
└─────────────────┘           └──────────┬───────────┘
                                         │
                                         ▼
┌─────────────────┐   1/sec   ┌──────────────────────┐
│   fetch.py      │──────────▶│  moxfield_decks      │
│ (continuous)    │           │  moxfield_deck_cards │
└─────────────────┘           └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │ aggregate.sql        │
                              │ (nightly)            │
                              └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │ popularity_signals   │
                              │ source='moxfield'    │
                              └──────────────────────┘
```

## Phase 1 — Default-printing detection

The bonus ask: **filter out "Moxfield defaulted them into this printing"**
so the signal only reflects active art choices.

Two routes, do both:

### 1a. API recon (quick, may not pan out)

Probe `api2.moxfield.com/v3/cards/{name}` (or whatever their card endpoint
is — discover via DevTools on a real Moxfield page) to see if the response
exposes a "default printing" hint. Things to look for:
- `defaultPrintingId` / `preferredPrintingId`
- A `printings` array with one flagged `isDefault: true`
- Whether their "Add card" UI's default differs from the cheapest

If they expose it directly: just cache `oracle_id → default_scryfall_id`
in a `moxfield_defaults` table, refresh weekly.

### 1b. Empirical mode-detection (robust fallback)

If API doesn't expose it, derive empirically:
- For each `oracle_id`, count occurrences of each `scryfall_id` across all
  scraped decks.
- The mode is "the printing Moxfield's algorithm picks most of the time"
  — treat as the inferred default.
- Confidence = mode_count / total. Below ~0.4 confidence → skip filtering
  for that oracle (no clear default; all uses count as "chosen").
- Recompute weekly as more decks land.

Schema:
```sql
CREATE TABLE moxfield_defaults (
  oracle_id UUID PRIMARY KEY REFERENCES oracle_cards(oracle_id),
  default_scryfall_id UUID REFERENCES printings(scryfall_id),
  source TEXT NOT NULL,            -- 'api' | 'inferred'
  confidence REAL,                 -- mode share for inferred; 1.0 for API
  sample_size INT,                 -- total uses across decks
  computed_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Phase 2 — Scraping infrastructure

### Schema (one migration)

```sql
CREATE TABLE moxfield_scrape_queue (
  deck_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,            -- 'pending' | 'done' | 'failed'
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  fetched_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ,     -- from Moxfield, for freshness cutoffs
  error TEXT,
  retry_count INT DEFAULT 0
);
CREATE INDEX ON moxfield_scrape_queue (status, discovered_at);

CREATE TABLE moxfield_decks (
  deck_id TEXT PRIMARY KEY,
  fetched_at TIMESTAMPTZ NOT NULL,
  last_updated_at TIMESTAMPTZ,
  format TEXT,
  card_count INT
);
CREATE INDEX ON moxfield_decks (last_updated_at DESC);

CREATE TABLE moxfield_deck_cards (
  deck_id TEXT REFERENCES moxfield_decks(deck_id) ON DELETE CASCADE,
  scryfall_id UUID,                -- FK to printings.scryfall_id (no CASCADE — keep history if printings purged)
  quantity INT NOT NULL,
  board TEXT,                      -- 'mainboard' | 'commanders'
  PRIMARY KEY (deck_id, scryfall_id, board)
);
CREATE INDEX ON moxfield_deck_cards (scryfall_id);
```

`popularity_signals` already exists and is the destination.

### `scripts/scrape_moxfield_discover.py` — nightly

Endpoint (verify): `api2.moxfield.com/v3/decks/search?format=commander&sortBy=lastUpdated&visibility=public&pageNumber=N&pageSize=64`

- Track a watermark (`last_seen_lastUpdated`) per format in a small
  `scraper_state` table or `popularity_signals` config row.
- Page through decks newer than the watermark until exhausted.
- Insert each deck_id into `moxfield_scrape_queue` with `status='pending'`
  and the deck's `lastUpdated` timestamp.
- ON CONFLICT (deck_id) DO UPDATE last_updated_at if newer (re-fetch decks
  that have changed since we last saw them).
- Update watermark.
- 1 req/sec. ~60 decks/page → manageable.

### `scripts/scrape_moxfield_fetch.py` — continuous worker

- `SELECT ... FROM moxfield_scrape_queue WHERE status='pending' ORDER BY
  discovered_at LIMIT 1` — one at a time so it's restartable.
- Endpoint (verify): `api2.moxfield.com/v3/decks/all/{deck_id}`.
- Extract `scryfall_id` from `mainboard` + `commanders` boards. Skip
  `sideboard` / `considering` / `maybeboard`.
- Resolve scryfall_id against our `printings` table; drop any unknown ids
  (most likely tokens, art_series, etc. — irrelevant for Commander).
- Upsert into `moxfield_decks` + `moxfield_deck_cards`.
- Mark queue row `status='done'`. On 404 or invalid: `failed`, no retry.
  On 5xx / network: `failed` with `retry_count++` if < 3.
- `time.sleep(1)` between requests. Strict 1 req/sec ceiling.
- Designed to run as a long-lived `systemd` / `pm2` process or a frequent
  cron (`*/5 * * * *` and let it process N then exit).

### Rate / cost

- Moxfield has roughly 50k-100k new+updated public Commander decks per
  week (rough order-of-magnitude). 1/sec × 86400 sec = 86k/day max.
- Steady state: discovery finds ~10k/day; fetcher catches up easily.
- First-time backfill: skip — start from "now forward" and let signal
  build over 2-4 weeks before flipping the UI sort.

## Phase 3 — Aggregation

Nightly SQL job (Postgres function or `psql -f aggregate.sql`):

```sql
WITH window AS (SELECT NOW() - INTERVAL '30 days' AS cutoff),
usage AS (
  SELECT p.illustration_id, p.oracle_id, mdc.scryfall_id,
         COUNT(DISTINCT mdc.deck_id) AS deck_count
  FROM moxfield_deck_cards mdc
  JOIN moxfield_decks md ON md.deck_id = mdc.deck_id
  JOIN printings p ON p.scryfall_id = mdc.scryfall_id
  CROSS JOIN window w
  WHERE md.last_updated_at >= w.cutoff
    AND md.format = 'commander'
    AND p.illustration_id IS NOT NULL
  GROUP BY p.illustration_id, p.oracle_id, mdc.scryfall_id
),
chosen AS (
  -- Sum usage where the printing isn't this oracle's default
  SELECT u.illustration_id,
         SUM(CASE
               WHEN d.default_scryfall_id IS NULL THEN u.deck_count   -- no default known: count all
               WHEN u.scryfall_id != d.default_scryfall_id THEN u.deck_count
               ELSE 0
             END) AS chosen_count,
         SUM(u.deck_count) AS total_count
  FROM usage u
  LEFT JOIN moxfield_defaults d ON d.oracle_id = u.oracle_id
  GROUP BY u.illustration_id
)
INSERT INTO popularity_signals (illustration_id, source, signal_type, value)
SELECT illustration_id, 'moxfield', 'commander_chosen_30d', chosen_count
FROM chosen
WHERE chosen_count > 0
UNION ALL
SELECT illustration_id, 'moxfield', 'commander_total_30d', total_count
FROM chosen
WHERE total_count > 0
ON CONFLICT (illustration_id, source, signal_type)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

Two signals stored:
- `commander_chosen_30d` — non-default uses (the "real" popularity signal)
- `commander_total_30d` — all uses (sanity-check / fallback)

## Phase 4 — Surface in UI

Modify `get_top_illustrations` (migration 079) so `sort='popularity'`:
1. Joins `popularity_signals` for `source='moxfield' AND signal_type='commander_chosen_30d'`
2. Orders by `COALESCE(signal.value, 0) DESC` first, then `elo_rating DESC`, then card_name

Same change for `get_illustrations_for_set`. Internal-only change; no UI
copy needed.

Optionally: add a separate sort key `"played"` if we want both signals
exposed.

## Phase 5 — Ops

- **Discovery cron**: 02:00 UTC daily.
- **Fetcher**: long-lived. Restart on failure via process supervisor.
- **Aggregation cron**: 04:00 UTC daily (after fetcher catches up).
- **Default refresh cron**: Sunday 05:00 UTC.
- **User-Agent**: `MTGInk/1.0 (https://mtg.ink, contact@mtg.ink)` — match
  what `import_edhrec.py` uses.
- **Backoff**: respect `Retry-After`; on 429 sleep 60s; on 403 pause the
  fetcher and alert.
- **Observability**: nightly Slack/email summary — decks fetched, queue
  depth, top 20 chosen illustrations.

## Phased delivery

Don't try to ship it all at once.

| Phase | What ships | When usable |
|---|---|---|
| **1** | Schema + discovery + fetch (no aggregation) | After 1 week of data accumulates |
| **2** | Aggregation w/ `commander_total_30d` only (no default filter) | UI gets a real popularity sort |
| **3** | API recon → if defaults exposed, populate `moxfield_defaults` | Better signal |
| **4** | Empirical default detection if API didn't pan out | Better signal |
| **5** | Switch UI sort to `commander_chosen_30d` | Most-picked art ranks |

Phase 1+2 alone is already a huge upgrade over ELO-only. Phase 3-5 is the
"chosen vs default" refinement.

## Risks / unknowns

- **Moxfield API stability**: undocumented. Endpoints could change. Code
  defensively: validate response shape, fail gracefully.
- **ToS**: Moxfield doesn't publish a formal robots.txt for `api2.*` but
  has been historically tolerant of slow well-identified scrapers. 1/sec
  is conservative. If they ever ask us to stop, we stop.
- **Default-detection ambiguity**: cards with no clear default (e.g., a
  card with 50 printings spread evenly) leave the filter inactive. Fine
  — we just count all uses for those, which is no worse than today.
- **Cold-start coverage**: takes 2-4 weeks of scraping before signal is
  representative. Don't surface the new sort until then.

## What goes in this repo

```
scripts/
  scrape_moxfield_discover.py
  scrape_moxfield_fetch.py
  scrape_moxfield_recon.py        # one-off: probe their card API, sniff defaults
  aggregate_moxfield_signals.sql

supabase/migrations/
  080_moxfield_scrape_tables.sql  # queue + decks + deck_cards + defaults
  081_get_top_illustrations_with_signals.sql  # RPC update once we have data
```

## Open decisions before implementing

1. Do we run the fetcher on a server we control, or a Vercel cron? (Cron
   has 60s execution limit — fetcher needs continuous; probably needs a
   dedicated VM or Railway / Fly worker.)
2. How do we handle decks that get deleted on Moxfield? Re-discovery
   would surface 404; we leave the historical data intact (the deck used
   that card at some point in the 30d window).
3. Foil/non-foil distinction — relevant for art? No. Treat them as the
   same illustration.
