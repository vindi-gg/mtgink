# Daily Results + Gauntlet Giveaway Program

## Status: Deferred

## Concept
Hide today's community vote distribution until the day ends (4 AM UTC rollover). Show yesterday's full results prominently. Logged-in users can track their "success rate" — how often they picked what the community picked.

## Why
- Prevents anchoring bias (voting with the crowd)
- Makes each vote feel independent and genuine
- Enables future giveaway mechanics where correct guesses matter
- Creates retention loop — reason to come back tomorrow

## Design Decision (Open)
Three options discussed:
1. **Full blackout** — no stats until rollover
2. **Participation count only** — show "1,247 others voted today" but not vote distribution (recommended)
3. **Show everything** — current behavior, instant gratification

Option 2 is the sweet spot: social proof without spoiling outcomes.

## Implementation When Ready

### Date Boundary
- `getChallengeDate()` — if UTC hour < 4, return yesterday's date; else today
- `getResultsDate()` — always `challengeDate - 1`
- All daily queries use these helpers instead of raw `new Date()`

### API Changes
- `GET /api/daily` — return `{ today: [...], yesterday: [...], successRate? }`
- `POST /api/daily/[type]/complete` — return only participation_count, not full stats
- New: `GET /api/daily/yesterday` — yesterday's challenges with full stats

### Success Rate (logged-in users)
- VS: did user pick the side with more votes?
- Remix: did user vote for the illustration with the most total votes?
- Gauntlet: did user's champion match the most popular champion?
- Query: join `daily_participations` with `daily_challenge_stats` for all past challenges
- Display: "You matched the community X/Y times (Z%)"

### Frontend Changes
- After completion: show "Vote recorded! 1,247 others voted today. Results at 4 AM UTC."
- Homepage: "Yesterday's Results" section with DailyResultsPanel
- Daily pages: show yesterday's results below today's challenge
- Profile/nav: success rate badge for logged-in users

### Giveaway Hook
- Once success rate tracking is in place, can tie to rewards
- "Predict the community pick 5 days in a row" type challenges
- Leaderboard of most accurate predictors
