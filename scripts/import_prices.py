#!/usr/bin/env python3
"""Seed prices table from Scryfall price fields already in printings table."""

import os
import json
import psycopg2
from psycopg2.extras import execute_values

SUPABASE_DB_URL = os.environ["SUPABASE_DB_URL"]


def get_marketplace_ids(cur):
    cur.execute("SELECT id, name FROM marketplaces")
    return {row[1]: row[0] for row in cur.fetchall()}


def main():
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cur = conn.cursor()

    marketplace_ids = get_marketplace_ids(cur)
    tcgplayer_id_mp = marketplace_ids["tcgplayer"]
    cardmarket_id_mp = marketplace_ids["cardmarket"]

    # Get all printings with price data
    cur.execute("""
        SELECT scryfall_id, tcgplayer_id, cardmarket_id, price_usd, price_eur, purchase_uris
        FROM printings
        WHERE (price_usd IS NOT NULL AND price_usd != '')
           OR (price_eur IS NOT NULL AND price_eur != '')
    """)

    rows = cur.fetchall()
    print(f"Processing {len(rows)} printings with price data...")

    prices_to_insert = []
    for scryfall_id, tcgplayer_id, cardmarket_id, price_usd, price_eur, purchase_uris_json in rows:
        purchase_uris = {}
        if purchase_uris_json:
            try:
                purchase_uris = json.loads(purchase_uris_json) if isinstance(purchase_uris_json, str) else purchase_uris_json
            except (json.JSONDecodeError, TypeError):
                pass

        # TCGPlayer price
        if price_usd:
            try:
                usd = float(price_usd)
                product_url = None
                if tcgplayer_id:
                    product_url = f"https://www.tcgplayer.com/product/{tcgplayer_id}"
                elif purchase_uris.get("tcgplayer"):
                    product_url = purchase_uris["tcgplayer"]

                prices_to_insert.append((
                    scryfall_id, tcgplayer_id_mp,
                    str(tcgplayer_id) if tcgplayer_id else None,
                    product_url,
                    'NM', False, usd, None, None, 'USD', True, 'scryfall'
                ))
            except (ValueError, TypeError):
                pass

        # Cardmarket price
        if price_eur:
            try:
                eur = float(price_eur)
                product_url = None
                if purchase_uris.get("cardmarket"):
                    product_url = purchase_uris["cardmarket"]

                prices_to_insert.append((
                    scryfall_id, cardmarket_id_mp,
                    str(cardmarket_id) if cardmarket_id else None,
                    product_url,
                    'NM', False, eur, None, None, 'EUR', True, 'scryfall'
                ))
            except (ValueError, TypeError):
                pass

    # Batch upsert
    print(f"Upserting {len(prices_to_insert)} price records...")
    batch_size = 5000
    for i in range(0, len(prices_to_insert), batch_size):
        batch = prices_to_insert[i:i + batch_size]
        execute_values(
            cur,
            """INSERT INTO prices (scryfall_id, marketplace_id, product_id, product_url,
                                   condition, is_foil, market_price, low_price, mid_price,
                                   currency, in_stock, source)
               VALUES %s
               ON CONFLICT (scryfall_id, marketplace_id, condition, is_foil)
               DO UPDATE SET market_price = EXCLUDED.market_price,
                             product_url = EXCLUDED.product_url,
                             product_id = EXCLUDED.product_id,
                             last_updated = NOW()""",
            batch
        )
        conn.commit()
        print(f"  Batch {i // batch_size + 1}: {len(batch)} records")

    # Log the update
    cur.execute("""
        INSERT INTO price_update_log (marketplace, cards_updated, status, completed_at)
        VALUES ('scryfall_seed', %s, 'completed', NOW())
    """, (len(prices_to_insert),))
    conn.commit()

    cur.close()
    conn.close()
    print(f"Done! Seeded {len(prices_to_insert)} prices.")


if __name__ == "__main__":
    main()
