# Card Data Pipeline Plan

## Goal
Download ALL Magic: The Gathering card data from Scryfall, store it in a local database with proper versioning, and download card art images.

## Key Findings from Research

### Data Scale
- ~29,000 unique oracle cards (logical cards)
- ~45-55,000 unique illustrations
- ~86-100,000 English printings
- ~300-400,000+ all-language printings
- ~800+ sets

### ID System (Critical)
- **scryfall_id** (UUID): Primary key per printing - THE canonical unique identifier
- **oracle_id** (UUID): Groups all printings of the same logical card (e.g., all Lightning Bolts share one)
- **illustration_id** (UUID): Groups printings sharing the same artwork
- **tcgplayer_id** (integer, nullable): TCGPlayer product ID - already in Scryfall data
- **set_code + collector_number + language**: The human-readable unique key

### Scryfall Bulk Data
- Use "Default Cards" (~504 MB) - every English printing
- Bulk JSON file, updated every 12 hours
- No rate limits for bulk download
- Images on CDN (*.scryfall.io) are exempt from API rate limits
- Must use proper User-Agent header

### TCGPlayer Integration
- No API access needed - Scryfall includes tcgplayer_id + pricing
- Affiliate links constructable from tcgplayer_id: `https://www.tcgplayer.com/product/{tcgplayer_id}`
- Pricing (usd, usd_foil) included in Scryfall data

## Implementation Plan

### Phase 1: Database Schema (SQLite for now)
Tables:
- `sets` - ~800 rows
- `oracle_cards` - ~29K rows (one per logical card)
- `printings` - ~100K rows (one per English printing, our main table)
- `card_faces` - for multi-face cards (transform, split, modal DFC, etc.)

### Phase 2: Download Pipeline
1. Fetch bulk data index from `/bulk-data`
2. Download "Default Cards" JSON (~504 MB)
3. Download sets from `/sets`
4. Parse and import into SQLite

### Phase 3: Image Downloads
- Download `normal` (488x680) and `art_crop` images for every printing
- Store locally in `data/images/{set_code}/{collector_number}/`
- Images CDN has no rate limits but be reasonable (~50-100ms between requests)
- ~100K printings × 2 images = ~200K images

### Phase 4: Data Validation
- Verify counts match expected
- Spot-check known cards (Lightning Bolt, Black Lotus, etc.)
- Verify TCGPlayer IDs present where expected

## File Structure
```
mtgink/
├── data/
│   ├── bulk/              # Raw Scryfall bulk JSON files
│   ├── images/            # Downloaded card images
│   │   └── {set_code}/
│   │       └── {collector_number}_normal.jpg
│   │       └── {collector_number}_art_crop.jpg
│   └── mtgink.db          # SQLite database
├── scripts/
│   ├── download_bulk.py   # Download Scryfall bulk data
│   ├── import_data.py     # Parse JSON and import to SQLite
│   ├── download_images.py # Download card images
│   └── models.py          # SQLAlchemy models / schema
└── requirements.txt
```

## Tech Decisions
- **SQLite** for initial storage (portable, zero config, good for prototyping)
- **Python** for scripts (requests, json, sqlite3)
- **No Django yet** - just get the data first, framework comes later
- Images stored locally for now, can move to S3/R2 later
