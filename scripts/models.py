"""SQLite database schema for MTG Ink card data."""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "mtgink.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    return conn


def create_tables(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS sets (
            set_code TEXT PRIMARY KEY,
            set_id TEXT NOT NULL,
            name TEXT NOT NULL,
            set_type TEXT,
            released_at TEXT,
            card_count INTEGER,
            printed_size INTEGER,
            digital INTEGER DEFAULT 0,
            foil_only INTEGER DEFAULT 0,
            nonfoil_only INTEGER DEFAULT 0,
            parent_set_code TEXT,
            block_code TEXT,
            block TEXT,
            icon_svg_uri TEXT,
            scryfall_uri TEXT,
            search_uri TEXT
        );

        CREATE TABLE IF NOT EXISTS oracle_cards (
            oracle_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            layout TEXT,
            mana_cost TEXT,
            cmc REAL,
            type_line TEXT,
            oracle_text TEXT,
            colors TEXT,  -- JSON array
            color_identity TEXT,  -- JSON array
            keywords TEXT,  -- JSON array
            power TEXT,
            toughness TEXT,
            loyalty TEXT,
            defense TEXT,
            legalities TEXT,  -- JSON object
            reserved INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS printings (
            scryfall_id TEXT PRIMARY KEY,
            oracle_id TEXT NOT NULL REFERENCES oracle_cards(oracle_id),
            set_code TEXT NOT NULL REFERENCES sets(set_code),
            collector_number TEXT NOT NULL,
            name TEXT NOT NULL,
            lang TEXT NOT NULL DEFAULT 'en',
            released_at TEXT,
            rarity TEXT,
            illustration_id TEXT,
            artist TEXT,
            artist_ids TEXT,  -- JSON array
            border_color TEXT,
            frame TEXT,
            frame_effects TEXT,  -- JSON array
            full_art INTEGER DEFAULT 0,
            textless INTEGER DEFAULT 0,
            booster INTEGER DEFAULT 0,
            promo INTEGER DEFAULT 0,
            promo_types TEXT,  -- JSON array
            reprint INTEGER DEFAULT 0,
            variation INTEGER DEFAULT 0,
            variation_of TEXT,
            finishes TEXT,  -- JSON array
            oversized INTEGER DEFAULT 0,
            digital INTEGER DEFAULT 0,
            flavor_text TEXT,
            watermark TEXT,
            image_status TEXT,
            -- Image URIs
            image_uri_small TEXT,
            image_uri_normal TEXT,
            image_uri_large TEXT,
            image_uri_png TEXT,
            image_uri_art_crop TEXT,
            image_uri_border_crop TEXT,
            -- External IDs
            tcgplayer_id INTEGER,
            tcgplayer_etched_id INTEGER,
            cardmarket_id INTEGER,
            mtgo_id INTEGER,
            mtgo_foil_id INTEGER,
            arena_id INTEGER,
            multiverse_ids TEXT,  -- JSON array
            -- Pricing
            price_usd TEXT,
            price_usd_foil TEXT,
            price_usd_etched TEXT,
            price_eur TEXT,
            price_eur_foil TEXT,
            price_tix TEXT,
            -- Purchase URIs
            purchase_uri_tcgplayer TEXT,
            purchase_uri_cardmarket TEXT,
            purchase_uri_cardhoarder TEXT,
            -- Scryfall URIs
            scryfall_uri TEXT,
            prints_search_uri TEXT,
            rulings_uri TEXT,
            -- Local image paths (populated after download)
            local_image_normal TEXT,
            local_image_art_crop TEXT,
            -- Timestamps
            imported_at TEXT DEFAULT (datetime('now')),
            UNIQUE(set_code, collector_number, lang)
        );

        CREATE TABLE IF NOT EXISTS card_faces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scryfall_id TEXT NOT NULL REFERENCES printings(scryfall_id),
            face_index INTEGER NOT NULL,
            name TEXT NOT NULL,
            mana_cost TEXT,
            type_line TEXT,
            oracle_text TEXT,
            colors TEXT,  -- JSON array
            color_indicator TEXT,  -- JSON array
            power TEXT,
            toughness TEXT,
            loyalty TEXT,
            defense TEXT,
            flavor_text TEXT,
            watermark TEXT,
            artist TEXT,
            artist_id TEXT,
            illustration_id TEXT,
            -- Image URIs (for double-faced cards)
            image_uri_small TEXT,
            image_uri_normal TEXT,
            image_uri_large TEXT,
            image_uri_png TEXT,
            image_uri_art_crop TEXT,
            image_uri_border_crop TEXT,
            UNIQUE(scryfall_id, face_index)
        );

        -- Indexes for common queries
        CREATE INDEX IF NOT EXISTS idx_printings_oracle_id ON printings(oracle_id);
        CREATE INDEX IF NOT EXISTS idx_printings_set_code ON printings(set_code);
        CREATE INDEX IF NOT EXISTS idx_printings_illustration_id ON printings(illustration_id);
        CREATE INDEX IF NOT EXISTS idx_printings_name ON printings(name);
        CREATE INDEX IF NOT EXISTS idx_printings_tcgplayer_id ON printings(tcgplayer_id);
        CREATE INDEX IF NOT EXISTS idx_printings_rarity ON printings(rarity);
        CREATE INDEX IF NOT EXISTS idx_printings_artist ON printings(artist);
        CREATE INDEX IF NOT EXISTS idx_card_faces_scryfall_id ON card_faces(scryfall_id);
        CREATE INDEX IF NOT EXISTS idx_oracle_cards_name ON oracle_cards(name);
    """)
    conn.commit()


def create_tag_tables(conn: sqlite3.Connection):
    conn.executescript("""
        DROP TABLE IF EXISTS illustration_tags;
        DROP TABLE IF EXISTS oracle_tags;
        DROP TABLE IF EXISTS tags;

        CREATE TABLE tags (
            tag_id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            type TEXT NOT NULL,  -- 'illustration' or 'oracle'
            description TEXT
        );

        CREATE TABLE illustration_tags (
            illustration_id TEXT NOT NULL,
            tag_id TEXT NOT NULL REFERENCES tags(tag_id),
            PRIMARY KEY (illustration_id, tag_id)
        );

        CREATE TABLE oracle_tags (
            oracle_id TEXT NOT NULL,
            tag_id TEXT NOT NULL REFERENCES tags(tag_id),
            PRIMARY KEY (oracle_id, tag_id)
        );

        CREATE INDEX IF NOT EXISTS idx_illustration_tags_tag_id ON illustration_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_oracle_tags_tag_id ON oracle_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_tags_type ON tags(type);
        CREATE INDEX IF NOT EXISTS idx_tags_label ON tags(label);
    """)
    conn.commit()


if __name__ == "__main__":
    conn = get_connection()
    create_tables(conn)
    print(f"Database created at {DB_PATH}")
    conn.close()
