# Tag-Enhanced Search

## Goal
Search that combines card name matching with Scryfall Tagger art/oracle tags, so searching "sword" finds both Swords to Plowshares AND cards that depict swords in their art.

## Why Tags Matter
- "sword" name search: ~30 cards
- "sword" tag search: 3,850 unique cards (Ajani, Mystic Forge, Plaza of Heroes, etc.)
- Sub-tags add specificity: `raised-sword` (332), `burning-sword` (159), `greatsword` (117)

## Search Ranking (proposed)
1. **Exact name match** — highest priority
2. **Name prefix/contains** — standard text search
3. **Tag matches** — cards whose art or function matches the query
   - More matching tags = higher rank (e.g., `sword` + `raised-sword` + `glowing-sword` > just `sword`)
   - Illustration tags (art) and oracle tags (function) both contribute

## Pagination
- Results will be large for common terms — must paginate (e.g., 50 per page)
- Consider separate sections: "Cards named X" vs "Cards depicting X"

## Implementation (TBD — depends on API framework)
- SQLite FTS5 for name search
- Tag search via `illustration_tags`/`oracle_tags` JOIN on `tags.label`
- LIKE or FTS on `tags.label` for partial tag matching (e.g., "sword" matches `sword`, `burning-sword`, `raised-sword`)
- API endpoint: `GET /api/search?q=sword&page=1`
- Response includes match reason (name, art tag, oracle tag) so UI can explain why a card appeared

## Open Questions
- Should tag matches show the matching tag labels in results? (e.g., "matched: sword, raised-sword")
- Weight illustration tags vs oracle tags differently?
- Support tag-only search syntax? (e.g., `tag:sword` vs `sword`)
- How to handle very broad tags like `sword` (4,612 associations) vs specific ones?
