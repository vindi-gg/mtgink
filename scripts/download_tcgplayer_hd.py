"""Download high-resolution card images from TCGPlayer's CDN.

TCGPlayer's product-images CDN responds to a `fit-in/{N}x{N}/{tcgplayer_id}.jpg`
pattern that delivers up to 1433×2000 — about 3.7× more pixels than
Scryfall's PNG (745×1040), which is the largest variant Scryfall hosts. We
fetch one HD image per printing that has a tcgplayer_id and stash it
locally as `data/images/{set_code}/{collector_number}_hd.jpg`. The lightbox
uses HD when `has_image_hd = TRUE`, falling back to Scryfall PNG otherwise.

Usage:
    SUPABASE_DB_URL=... python3 scripts/download_tcgplayer_hd.py
    SUPABASE_DB_URL=... python3 scripts/download_tcgplayer_hd.py --limit 100
    SUPABASE_DB_URL=... python3 scripts/download_tcgplayer_hd.py --rate 0.5

Resume-safe: skips printings already flagged `has_image_hd=TRUE` and
existing files on disk (size > 0). Updates the DB flag in batches.
"""

from __future__ import annotations

import argparse
import os
import random
import sys
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests

IMAGES_DIR = Path(__file__).parent.parent / "data" / "images"
HEADERS = {
    "User-Agent": "MTGInk/1.0 (https://mtg.ink, card art popularity tracker)",
    "Accept": "image/jpeg,image/*",
}

DEFAULT_FIT = 2000  # → 1433×2000 actual
DEFAULT_RATE = 0.4  # seconds between requests; 0.4 ≈ 2.5 req/sec
JITTER = 0.1        # seconds, +/- random jitter so we don't hammer in lockstep
DB_FLUSH_EVERY = 50 # commit `has_image_hd=TRUE` every N successful downloads


def hd_image_path(set_code: str, collector_number: str) -> Path:
    safe_num = collector_number.replace("/", "_").replace("*", "star")
    return IMAGES_DIR / set_code / f"{safe_num}_hd.jpg"


def tcgplayer_url(tcgplayer_id: int, fit: int) -> str:
    return f"https://product-images.tcgplayer.com/fit-in/{fit}x{fit}/{tcgplayer_id}.jpg"


def fetch_one(url: str, dest: Path, session: requests.Session) -> tuple[str, str]:
    """Returns (status, detail) where status is 'ok' | 'skip' | 'fail'."""
    if dest.exists() and dest.stat().st_size > 0:
        return ("skip", "exists")

    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        resp = session.get(url, headers=HEADERS, timeout=30)
    except Exception as e:
        return ("fail", f"network {e}")

    if resp.status_code == 404:
        return ("fail", "404")
    if resp.status_code == 429:
        return ("fail", "429 — slow down")
    if resp.status_code != 200:
        return ("fail", f"http {resp.status_code}")
    if not resp.content or len(resp.content) < 1000:
        return ("fail", f"tiny body ({len(resp.content)}b)")

    # Atomic write
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    with open(tmp, "wb") as f:
        f.write(resp.content)
    tmp.rename(dest)
    return ("ok", f"{len(resp.content)}b")


def main():
    parser = argparse.ArgumentParser(description="Download HD card images from TCGPlayer")
    parser.add_argument("--fit", type=int, default=DEFAULT_FIT,
                        help=f"fit-in box size (default {DEFAULT_FIT}; gives 1433×2000)")
    parser.add_argument("--rate", type=float, default=DEFAULT_RATE,
                        help=f"seconds between requests (default {DEFAULT_RATE})")
    parser.add_argument("--limit", type=int, default=None,
                        help="cap number of printings processed (for testing)")
    parser.add_argument("--set", dest="set_code", default=None,
                        help="restrict to a single set_code")
    parser.add_argument("--force", action="store_true",
                        help="re-fetch even if has_image_hd=TRUE / file exists")
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
        print("ERROR: SUPABASE_DB_URL not set and not found in web/.env.local")
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    where = ["p.tcgplayer_id IS NOT NULL", "s.digital = FALSE"]
    params: list = []
    if not args.force:
        where.append("p.has_image_hd = FALSE")
    if args.set_code:
        where.append("p.set_code = %s")
        params.append(args.set_code)
    sql = f"""
      SELECT p.scryfall_id, p.set_code, p.collector_number, p.tcgplayer_id
      FROM printings p
      JOIN sets s ON s.set_code = p.set_code
      WHERE {' AND '.join(where)}
      ORDER BY p.set_code, p.collector_number
    """
    if args.limit:
        sql += f" LIMIT {args.limit}"
    cur.execute(sql, params)
    rows = cur.fetchall()
    total = len(rows)
    print(f"Queued {total:,} printings for HD download (fit-in/{args.fit}x{args.fit})")
    if total == 0:
        cur.close()
        conn.close()
        return

    eta_s = total * args.rate
    print(f"  Rate: ~{1/args.rate:.1f} req/sec, est. {eta_s/3600:.1f}h to finish")
    print(f"  Output: {IMAGES_DIR}")
    print()

    session = requests.Session()
    n_ok = n_skip = n_fail = 0
    flush_buf: list[str] = []
    started = time.time()
    consecutive_429 = 0

    for i, row in enumerate(rows, 1):
        scryfall_id = row["scryfall_id"]
        url = tcgplayer_url(row["tcgplayer_id"], args.fit)
        dest = hd_image_path(row["set_code"], row["collector_number"])

        status, detail = fetch_one(url, dest, session)

        if status == "ok":
            n_ok += 1
            flush_buf.append(scryfall_id)
            consecutive_429 = 0
        elif status == "skip":
            n_skip += 1
            # File already on disk → also flag in DB so future runs skip the query
            flush_buf.append(scryfall_id)
        else:
            n_fail += 1
            if "429" in detail:
                consecutive_429 += 1
                # Exponential backoff on rate-limit; bail if we keep hitting it
                sleep_for = min(60, 2 ** consecutive_429)
                print(f"  [{i}/{total}] {row['set_code']}/{row['collector_number']}: 429, sleeping {sleep_for}s")
                time.sleep(sleep_for)
                if consecutive_429 >= 5:
                    print("  Five consecutive 429s — stopping.")
                    break
            else:
                # Don't spam logs for routine 404s (cards not on TCGPlayer)
                if "404" not in detail or i <= 50 or i % 500 == 0:
                    print(f"  [{i}/{total}] {row['set_code']}/{row['collector_number']}: FAIL {detail}")

        # Periodic DB flush
        if len(flush_buf) >= DB_FLUSH_EVERY:
            cur.execute(
                "UPDATE printings SET has_image_hd = TRUE WHERE scryfall_id = ANY(%s::uuid[])",
                (flush_buf,),
            )
            conn.commit()
            flush_buf.clear()

        # Periodic progress
        if i % 100 == 0 or i == total:
            elapsed = time.time() - started
            eta_remaining = (total - i) * args.rate
            print(
                f"  [{i}/{total}] ok={n_ok} skip={n_skip} fail={n_fail} "
                f"elapsed={elapsed/60:.1f}m eta={eta_remaining/60:.0f}m",
                flush=True,
            )

        # Polite sleep with jitter
        sleep_for = max(0.05, args.rate + random.uniform(-JITTER, JITTER))
        time.sleep(sleep_for)

    # Final flush
    if flush_buf:
        cur.execute(
            "UPDATE printings SET has_image_hd = TRUE WHERE scryfall_id = ANY(%s::uuid[])",
            (flush_buf,),
        )
        conn.commit()

    print()
    print(f"=== Done ===")
    print(f"  Downloaded: {n_ok}")
    print(f"  Skipped (already had): {n_skip}")
    print(f"  Failed: {n_fail}")
    print(f"  Total time: {(time.time() - started)/60:.1f} min")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
