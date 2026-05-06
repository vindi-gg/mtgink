"""Discover public Moxfield Commander decks and queue them for fetching.

Hits Moxfield's `/v2/decks/search` endpoint (which is behind Cloudflare bot
protection — bypassed via curl_cffi's Chrome TLS impersonation, no API key
required) and inserts each `publicId` into `moxfield_scrape_queue` with
status='pending'. The fetcher script (scrape_moxfield_fetch.py) drains
that queue.

Moxfield caps `totalResults` at 10000 per query, so this script crawls the
most-recently-updated 10k Commander decks. Run nightly to keep up with
new + updated decks.

Usage:
    SUPABASE_DB_URL=... python3 scripts/scrape_moxfield_discover.py
    SUPABASE_DB_URL=... python3 scripts/scrape_moxfield_discover.py --pages 50

Polite: 1 second between page requests, 64 decks per page.
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
    print("ERROR: pip install curl_cffi (needed to bypass Moxfield's Cloudflare).")
    sys.exit(1)

PAGE_SIZE = 64
RATE = 1.0  # seconds between page requests
HEADERS = {
    "Origin": "https://www.moxfield.com",
    "Referer": "https://www.moxfield.com/",
    "Accept": "application/json",
}


def fetch_page(page_number: int, page_size: int = PAGE_SIZE) -> dict:
    url = (
        "https://api2.moxfield.com/v2/decks/search"
        f"?fmt=commander&sortBy=lastUpdated&visibility=public"
        f"&pageNumber={page_number}&pageSize={page_size}"
    )
    r = cffi_requests.get(url, impersonate="chrome", headers=HEADERS, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"Moxfield search HTTP {r.status_code}: {r.text[:200]}")
    return r.json()


def main():
    parser = argparse.ArgumentParser(description="Discover Moxfield Commander decks")
    parser.add_argument("--pages", type=int, default=None,
                        help="Cap pages crawled (default: all available, ~157 with totalResults=10000)")
    parser.add_argument("--rate", type=float, default=RATE,
                        help=f"Seconds between page requests (default {RATE})")
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
    cur = conn.cursor()

    print(f"Discovering Moxfield Commander decks (sortBy=lastUpdated, pageSize={PAGE_SIZE})...")

    # First page to learn total
    first = fetch_page(1)
    total_results = first.get("totalResults", 0)
    total_pages = first.get("totalPages", 0)
    print(f"  totalResults={total_results} totalPages={total_pages}")

    pages_to_crawl = total_pages
    if args.pages:
        pages_to_crawl = min(pages_to_crawl, args.pages)

    n_seen = 0
    n_queued = 0

    def upsert(decks):
        nonlocal n_queued
        rows = [
            (
                d["publicId"],
                d.get("lastUpdatedAtUtc"),
            )
            for d in decks
        ]
        if not rows:
            return
        # Insert as pending; if already known, refresh last_updated_at so
        # changed decks get re-fetched. Don't reset status (don't clobber
        # 'done' rows for decks we've already pulled — but DO refresh
        # last_updated_at so the fetcher can detect stale data).
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO moxfield_scrape_queue (deck_id, last_updated_at)
            VALUES %s
            ON CONFLICT (deck_id) DO UPDATE
              SET last_updated_at = EXCLUDED.last_updated_at,
                  -- If the deck was updated after we fetched it, requeue it
                  status = CASE
                    WHEN moxfield_scrape_queue.status = 'done'
                         AND EXCLUDED.last_updated_at > moxfield_scrape_queue.fetched_at
                      THEN 'pending'
                    ELSE moxfield_scrape_queue.status
                  END
            """,
            rows,
        )
        conn.commit()
        n_queued += cur.rowcount

    upsert(first.get("data", []))
    n_seen += len(first.get("data", []))

    for page in range(2, pages_to_crawl + 1):
        time.sleep(args.rate)
        try:
            payload = fetch_page(page)
        except Exception as e:
            print(f"  page {page} failed: {e} — stopping")
            break
        decks = payload.get("data", [])
        if not decks:
            print(f"  page {page} empty — stopping")
            break
        upsert(decks)
        n_seen += len(decks)
        if page % 10 == 0 or page == pages_to_crawl:
            print(f"  page {page}/{pages_to_crawl}  seen={n_seen}", flush=True)

    print()
    cur.execute("SELECT COUNT(*) FROM moxfield_scrape_queue WHERE status='pending'")
    pending = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM moxfield_scrape_queue")
    total = cur.fetchone()[0]
    print(f"Done. Saw {n_seen} decks. Queue: {pending} pending / {total} total.")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
