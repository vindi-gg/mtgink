"""Fetch full Moxfield Commander decks from the queue.

Drains `moxfield_scrape_queue` (populated by scrape_moxfield_discover.py),
hitting `/v3/decks/all/{publicId}` for each pending deck and storing
mainboard + commanders cards into `moxfield_decks` / `moxfield_deck_cards`.
Uses curl_cffi's Chrome TLS impersonation to bypass Cloudflare.

Sideboard / maybeboard / etc. are skipped — only mainboard + commanders
contribute to the per-illustration popularity signal (those are the cards
the user is actually building their deck around).

Usage:
    SUPABASE_DB_URL=... python3 scripts/scrape_moxfield_fetch.py
    SUPABASE_DB_URL=... python3 scripts/scrape_moxfield_fetch.py --rate 1.0 --max 5000

Polite: 1 second between deck fetches by default. Resume-safe — picks up
where it left off based on queue state.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import psycopg2
import psycopg2.extras

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    print("ERROR: pip install curl_cffi")
    sys.exit(1)

DEFAULT_RATE = 1.0
HEADERS = {
    "Origin": "https://www.moxfield.com",
    "Referer": "https://www.moxfield.com/",
    "Accept": "application/json",
}
COUNTED_BOARDS = ("mainboard", "commanders")


def fetch_deck(deck_id: str) -> dict:
    url = f"https://api2.moxfield.com/v3/decks/all/{deck_id}"
    r = cffi_requests.get(url, impersonate="chrome", headers=HEADERS, timeout=30)
    if r.status_code == 404:
        return {"_status": 404}
    if r.status_code != 200:
        return {"_status": r.status_code, "_text": r.text[:200]}
    return r.json()


def extract_cards(deck: dict) -> list[tuple[str, int, str]]:
    """Returns [(scryfall_id, quantity, board), ...]."""
    out: list[tuple[str, int, str]] = []
    boards = deck.get("boards", {})
    for board_name in COUNTED_BOARDS:
        cards = boards.get(board_name, {}).get("cards", {})
        for entry in cards.values():
            qty = entry.get("quantity", 0)
            if qty <= 0:
                continue
            sid = entry.get("card", {}).get("scryfall_id")
            if not sid:
                continue
            out.append((sid, qty, board_name))
    return out


def main():
    parser = argparse.ArgumentParser(description="Fetch queued Moxfield decks")
    parser.add_argument("--rate", type=float, default=DEFAULT_RATE,
                        help=f"Seconds between deck fetches (default {DEFAULT_RATE})")
    parser.add_argument("--max", type=int, default=None,
                        help="Cap number of decks fetched in this run")
    args = parser.parse_args()

    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        for env_file in ["web/.env.local", "web/.env.prod"]:
            p = Path(__file__).parent.parent / env_file
            if p.exists():
                for line in p.read_text().splitlines():
                    if line.startswith("SUPABASE_DB_URL="):
                        db_url = line.split("=", 1)[1]
                        break
            if db_url:
                break
    if not db_url:
        print("ERROR: SUPABASE_DB_URL not set.")
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT COUNT(*) AS c FROM moxfield_scrape_queue WHERE status='pending'")
    pending_total = cur.fetchone()["c"]
    print(f"{pending_total:,} pending decks. Rate: {1/args.rate:.1f} req/sec.")
    if args.max:
        print(f"  --max={args.max} (will stop after {args.max} decks)")
    print()

    n_done = n_fail = n_skipped = 0
    n_429 = 0
    started = time.time()

    while True:
        if args.max and (n_done + n_fail + n_skipped) >= args.max:
            print(f"Hit --max={args.max}, stopping.")
            break

        cur.execute(
            """
            SELECT deck_id FROM moxfield_scrape_queue
            WHERE status = 'pending'
            ORDER BY discovered_at
            LIMIT 1
            """
        )
        row = cur.fetchone()
        if not row:
            print("Queue drained.")
            break

        deck_id = row["deck_id"]
        deck = fetch_deck(deck_id)
        status = deck.get("_status")

        if status == 404:
            cur.execute(
                "UPDATE moxfield_scrape_queue SET status='failed', error='404', fetched_at=NOW() WHERE deck_id=%s",
                (deck_id,),
            )
            conn.commit()
            n_fail += 1
        elif status == 429:
            n_429 += 1
            sleep_for = min(120, 2 ** n_429)
            print(f"  429 — sleeping {sleep_for}s")
            time.sleep(sleep_for)
            if n_429 >= 5:
                print("  Five consecutive 429s — bailing.")
                break
            continue  # retry same deck
        elif status:
            # Other HTTP error
            cur.execute(
                "UPDATE moxfield_scrape_queue SET status='failed', error=%s, fetched_at=NOW(), retry_count=retry_count+1 WHERE deck_id=%s",
                (f"HTTP {status}: {deck.get('_text', '')[:80]}", deck_id),
            )
            conn.commit()
            n_fail += 1
        else:
            # Got a deck
            n_429 = 0  # reset on success
            cards = extract_cards(deck)
            last_updated = deck.get("lastUpdatedAtUtc")
            fmt = deck.get("format")

            cur.execute(
                """
                INSERT INTO moxfield_decks (deck_id, fetched_at, last_updated_at, format, card_count)
                VALUES (%s, NOW(), %s, %s, %s)
                ON CONFLICT (deck_id) DO UPDATE
                  SET fetched_at=EXCLUDED.fetched_at,
                      last_updated_at=EXCLUDED.last_updated_at,
                      format=EXCLUDED.format,
                      card_count=EXCLUDED.card_count
                """,
                (deck_id, last_updated, fmt, len(cards)),
            )
            # Replace card list (deck contents may have changed since previous fetch)
            cur.execute("DELETE FROM moxfield_deck_cards WHERE deck_id=%s", (deck_id,))
            if cards:
                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO moxfield_deck_cards (deck_id, scryfall_id, quantity, board) VALUES %s "
                    "ON CONFLICT (deck_id, scryfall_id, board) DO UPDATE SET quantity = EXCLUDED.quantity",
                    [(deck_id, sid, qty, board) for (sid, qty, board) in cards],
                )
            cur.execute(
                "UPDATE moxfield_scrape_queue SET status='done', fetched_at=NOW(), error=NULL WHERE deck_id=%s",
                (deck_id,),
            )
            conn.commit()
            n_done += 1

        total_processed = n_done + n_fail + n_skipped
        if total_processed % 50 == 0 or total_processed <= 5:
            elapsed = time.time() - started
            rate = total_processed / elapsed if elapsed > 0 else 0
            print(
                f"  done={n_done} fail={n_fail} elapsed={elapsed/60:.1f}m rate={rate:.1f}/s",
                flush=True,
            )

        time.sleep(args.rate)

    print()
    print(f"=== Stop ===")
    print(f"  Fetched: {n_done}")
    print(f"  Failed: {n_fail}")
    print(f"  Total time: {(time.time() - started)/60:.1f} min")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
