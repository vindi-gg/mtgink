"""Download Scryfall bulk data and sets."""

import json
import sys
import time
from pathlib import Path

import requests

BULK_DIR = Path(__file__).parent.parent / "data" / "bulk"
SCRYFALL_BASE = "https://api.scryfall.com"
HEADERS = {
    "User-Agent": "MTGInk/1.0 (card art popularity tracker)",
    "Accept": "application/json",
}


def download_file(url: str, dest: Path, desc: str = "") -> Path:
    """Download a file with progress reporting."""
    print(f"Downloading {desc or url}...")
    resp = requests.get(url, headers=HEADERS, stream=True)
    resp.raise_for_status()

    total = int(resp.headers.get("content-length", 0))
    downloaded = 0

    with open(dest, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
            downloaded += len(chunk)
            if total:
                pct = downloaded / total * 100
                mb_down = downloaded / 1024 / 1024
                mb_total = total / 1024 / 1024
                print(f"\r  {mb_down:.1f}/{mb_total:.1f} MB ({pct:.1f}%)", end="", flush=True)

    print(f"\n  Saved to {dest} ({dest.stat().st_size / 1024 / 1024:.1f} MB)")
    return dest


def download_sets() -> Path:
    """Download all sets from Scryfall."""
    dest = BULK_DIR / "sets.json"

    all_sets = []
    url = f"{SCRYFALL_BASE}/sets"

    while url:
        print(f"Fetching sets page...")
        resp = requests.get(url, headers=HEADERS)
        resp.raise_for_status()
        data = resp.json()
        all_sets.extend(data.get("data", []))
        url = data.get("next_page")
        if url:
            time.sleep(0.1)

    with open(dest, "w") as f:
        json.dump(all_sets, f)

    print(f"Downloaded {len(all_sets)} sets to {dest}")
    return dest


def download_bulk_cards(bulk_type: str = "default_cards") -> Path:
    """Download a Scryfall bulk data file.

    Types: oracle_cards, unique_artwork, default_cards, all_cards, rulings
    """
    # Get the bulk data index
    print(f"Fetching bulk data index for '{bulk_type}'...")
    resp = requests.get(f"{SCRYFALL_BASE}/bulk-data/{bulk_type}", headers=HEADERS)
    resp.raise_for_status()
    bulk_info = resp.json()

    download_uri = bulk_info["download_uri"]
    updated_at = bulk_info.get("updated_at", "unknown")
    size = bulk_info.get("size", 0)

    print(f"  Type: {bulk_info.get('name', bulk_type)}")
    print(f"  Updated: {updated_at}")
    print(f"  Size: {size / 1024 / 1024:.1f} MB")

    dest = BULK_DIR / f"{bulk_type}.json"
    return download_file(download_uri, dest, desc=f"bulk {bulk_type}")


def main():
    BULK_DIR.mkdir(parents=True, exist_ok=True)

    # Download sets first
    download_sets()

    # Download default cards (every English printing)
    download_bulk_cards("default_cards")

    # Also download oracle cards (one per logical card - useful for canonical data)
    download_bulk_cards("oracle_cards")

    print("\nAll downloads complete!")


if __name__ == "__main__":
    main()
