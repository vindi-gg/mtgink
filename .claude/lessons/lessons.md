# Lessons

## 2026-03-03: Always explore the full project before making claims
- CLAUDE.md said "Stack: TBD, likely Django" but there was already a full Next.js app in `web/`
- Always run `ls` on the project root and check for existing code before trusting documentation
- The user had to tell me to look at the actual code

## 2026-03-03: Check JSON structure before parsing
- Scryfall private tag endpoints return `{"object": ..., "has_more": ..., "data": [...]}` envelope
- Don't assume JSON files are flat arrays — always inspect structure first
- Used `json.load()` then iterated assuming list, but got dict
