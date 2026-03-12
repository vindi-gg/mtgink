# Showdown Migration Plan

## Terminology
| Old | New | Vote Level | Tables |
|---|---|---|---|
| Ink Mirror | Remix | illustration | `votes` + `art_ratings` |
| Ink VS / Clash | VS | card (oracle) | `card_votes` + `card_ratings` |
| Gauntlet | Gauntlet | TBD | placeholder |

## Display Modes (all showdown types)
- **Art** — art crop only
- **Card** — full card image

## Routes
- `/showdown` → redirect to `/showdown/remix`
- `/showdown/remix` — same card, pick best art
- `/showdown/vs` — card vs card
- `/showdown/gauntlet` — king of the hill (placeholder)

## Implementation Sequence

### Phase 1: ShowdownView Component ← biggest task
New `web/src/components/ShowdownView.tsx` replaces ComparisonView + ClashView.

**Props:**
```typescript
interface ShowdownViewProps {
  mode: "remix" | "vs";
  initialPair: ComparisonPair | ClashPair;
  initialFilters?: CompareFilters;
}
```

**Mode-dependent behavior:**
| | Remix | VS |
|---|---|---|
| Compare API | `/api/showdown/compare?mode=remix` | `/api/showdown/compare?mode=vs` |
| Vote API | `POST /api/showdown/vote` mode=remix | `POST /api/showdown/vote` mode=vs |
| Vote payload | illustration IDs | oracle IDs |
| Heading | "Which {name} art is best?" | "Which {filter} is best?" |
| Card names | Single card link | Both card names as links |
| Default view | art | card |

**Shared code (identical in both current components):**
- getSessionId, getInitialViewMode
- Constants: COLOR_LABELS, CARD_TYPES, POPULAR_SUBTYPES, PRESETS
- Filter helpers: filtersToParams, hasActiveFilters, filtersEqual
- Filter UI, keyboard shortcuts, skip, share, mobile scroll

### Phase 2: New Route Pages
- [ ] `web/src/app/showdown/page.tsx` — redirect to /showdown/remix
- [ ] `web/src/app/showdown/remix/page.tsx` — server component, calls getComparisonPair
- [ ] `web/src/app/showdown/vs/page.tsx` — server component, calls getClashPair
- [ ] `web/src/app/showdown/gauntlet/page.tsx` — placeholder

### Phase 3: Unified API Routes
- [ ] `GET /api/showdown/compare?mode=remix|vs` — delegates to existing query fns
- [ ] `POST /api/showdown/vote` with `{ mode, ...payload }` — delegates to recordVote or recordCardVote

### Phase 4: Test New Routes
Verify before touching old routes.

### Phase 5: Update Navbar
Replace Ink/Clash links with Remix/VS.

### Phase 6: Update All Internal Links
- [ ] `/` homepage — SHOWDOWN_MODES replacing INK_MODES + CLASH_MODES
- [ ] `/db/tribes/[type]` — single "VS" button → `/showdown/vs?subtype=...`, "Remix" button
- [ ] `/db/expansions/[set_code]` — "VS" + "Remix" buttons with set_code filter
- [ ] `/card/[slug]` — "Remix" button → `/showdown/remix?oracle_id=...`
- [ ] `/history` — links to /showdown/remix
- [ ] DeckView.tsx — compare links
- [ ] robots.ts — `/showdown` replaces `/ink`, `/clash`, `/bracket`

### Phase 7: Add Redirects (middleware.ts)
```
/ink            → /showdown/remix (301, preserve params)
/ink?mode=vs    → /showdown/vs (301, preserve other params)
/ink/gauntlet   → /showdown/gauntlet (301)
/clash          → /showdown/vs (301, preserve params)
/clash/gauntlet → /showdown/gauntlet (301)
/compare        → /showdown/remix (301)
```

### Phase 8: Delete Old Files
- [ ] ComparisonView.tsx, ClashView.tsx
- [ ] app/ink/*, app/clash/*
- [ ] Keep old API routes as thin wrappers (browser cache safety)

## Key Decisions
1. **CompareFilters.mode removed** — mode is route-level, not filter-level
2. **Favorite source stays "ink"/"clash" in DB** — no data migration needed
3. **vote_source**: new votes use "showdown_remix" / "showdown_vs", old data untouched
4. **Old Ink VS (cross-card art voting) removed** — VS is always card-level now
5. **Tribes/expansions get one "VS" button** (not separate Ink VS + Clash)
