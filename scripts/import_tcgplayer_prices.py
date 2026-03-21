#!/usr/bin/env python3
"""Fetch fresh prices from TCGPlayer API and upsert into prices table.

Usage:
    export SUPABASE_DB_URL=...
    export TCGPLAYER_PUBLIC_KEY=...
    export TCGPLAYER_PRIVATE_KEY=...
    python3 scripts/import_tcgplayer_prices.py

Rate limit: 300 requests/min. We fetch prices by group (set), ~443 groups = ~2 min.
"""

import os
import sys
import time
import requests
import psycopg2
from psycopg2.extras import execute_values

SUPABASE_DB_URL = os.environ["SUPABASE_DB_URL"]
TCGPLAYER_PUBLIC_KEY = os.environ["TCGPLAYER_PUBLIC_KEY"]
TCGPLAYER_PRIVATE_KEY = os.environ["TCGPLAYER_PRIVATE_KEY"]

API_BASE = "https://api.tcgplayer.com"
CATEGORY_ID = 1  # Magic: The Gathering
RATE_LIMIT_DELAY = 0.25  # 4 req/sec = 240/min, well under 300/min limit


def get_bearer_token():
    """Authenticate and return bearer token."""
    resp = requests.post(
        f"{API_BASE}/token",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data=f"grant_type=client_credentials&client_id={TCGPLAYER_PUBLIC_KEY}&client_secret={TCGPLAYER_PRIVATE_KEY}",
    )
    resp.raise_for_status()
    token = resp.json()["access_token"]
    print(f"Authenticated (expires: {resp.json().get('.expires', 'unknown')})")
    return token


def get_all_groups(token):
    """Fetch all MTG groups (sets) from TCGPlayer."""
    groups = []
    offset = 0
    limit = 100
    while True:
        resp = requests.get(
            f"{API_BASE}/catalog/categories/{CATEGORY_ID}/groups",
            headers={"Authorization": f"Bearer {token}"},
            params={"offset": offset, "limit": limit},
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        groups.extend(results)
        if len(results) < limit:
            break
        offset += limit
        time.sleep(RATE_LIMIT_DELAY)
    return groups


def get_group_prices(token, group_id):
    """Fetch all prices for a group (set)."""
    resp = requests.get(
        f"{API_BASE}/pricing/group/{group_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    resp.raise_for_status()
    return resp.json().get("results", [])


def build_tcgplayer_id_map(cur):
    """Build map of tcgplayer_id -> scryfall_id from printings table."""
    cur.execute("SELECT scryfall_id, tcgplayer_id FROM printings WHERE tcgplayer_id IS NOT NULL")
    return {row[1]: row[0] for row in cur.fetchall()}


def main():
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cur = conn.cursor()

    # Get TCGPlayer marketplace ID
    cur.execute("SELECT id FROM marketplaces WHERE name = 'tcgplayer'")
    row = cur.fetchone()
    if not row:
        print("ERROR: 'tcgplayer' marketplace not found")
        sys.exit(1)
    marketplace_id = row[0]

    # Build tcgplayer_id -> scryfall_id lookup
    print("Loading tcgplayer_id map from printings...")
    tcg_to_scryfall = build_tcgplayer_id_map(cur)
    print(f"  {len(tcg_to_scryfall)} printings with tcgplayer_id")

    # Authenticate
    token = get_bearer_token()

    # Fetch all groups
    print("Fetching MTG groups (sets)...")
    groups = get_all_groups(token)
    print(f"  {len(groups)} groups found")

    # Fetch prices group by group
    total_prices = 0
    matched_prices = 0
    skipped_groups = 0
    prices_to_upsert = []

    for i, group in enumerate(groups):
        group_id = group["groupId"]
        group_name = group["name"]

        try:
            price_entries = get_group_prices(token, group_id)
        except requests.HTTPError as e:
            print(f"  WARN: Group {group_id} ({group_name}) failed: {e}")
            skipped_groups += 1
            time.sleep(RATE_LIMIT_DELAY)
            continue

        for entry in price_entries:
            total_prices += 1
            product_id = entry.get("productId")
            if not product_id:
                continue

            scryfall_id = tcg_to_scryfall.get(product_id)
            if not scryfall_id:
                continue

            market_price = entry.get("marketPrice")
            low_price = entry.get("lowPrice")
            mid_price = entry.get("midPrice")

            # Skip entries with no price data at all
            if market_price is None and low_price is None and mid_price is None:
                continue

            sub_type = entry.get("subTypeName", "Normal")
            is_foil = sub_type == "Foil"

            product_url = f"https://www.tcgplayer.com/product/{product_id}"

            prices_to_upsert.append((
                scryfall_id, marketplace_id,
                str(product_id), product_url,
                "NM", is_foil,
                market_price, low_price, mid_price,
                "USD", True, "tcgplayer_api"
            ))
            matched_prices += 1

        if (i + 1) % 50 == 0:
            print(f"  {i + 1}/{len(groups)} groups processed ({matched_prices} prices matched)")

        time.sleep(RATE_LIMIT_DELAY)

    print(f"\nTotal price entries from API: {total_prices}")
    print(f"Matched to printings: {matched_prices}")
    print(f"Skipped groups: {skipped_groups}")

    # Batch upsert
    print(f"\nUpserting {len(prices_to_upsert)} price records...")
    batch_size = 5000
    for i in range(0, len(prices_to_upsert), batch_size):
        batch = prices_to_upsert[i:i + batch_size]
        execute_values(
            cur,
            """INSERT INTO prices (scryfall_id, marketplace_id, product_id, product_url,
                                   condition, is_foil, market_price, low_price, mid_price,
                                   currency, in_stock, source)
               VALUES %s
               ON CONFLICT (scryfall_id, marketplace_id, condition, is_foil)
               DO UPDATE SET market_price = EXCLUDED.market_price,
                             low_price = EXCLUDED.low_price,
                             mid_price = EXCLUDED.mid_price,
                             product_url = EXCLUDED.product_url,
                             product_id = EXCLUDED.product_id,
                             source = EXCLUDED.source,
                             last_updated = NOW()""",
            batch,
        )
        conn.commit()
        print(f"  Batch {i // batch_size + 1}: {len(batch)} records")

    # Log the update
    cur.execute("""
        INSERT INTO price_update_log (marketplace, cards_updated, status, completed_at)
        VALUES ('tcgplayer_api', %s, 'completed', NOW())
    """, (len(prices_to_upsert),))
    conn.commit()

    cur.close()
    conn.close()
    print(f"\nDone! Updated {len(prices_to_upsert)} TCGPlayer prices.")


if __name__ == "__main__":
    main()
