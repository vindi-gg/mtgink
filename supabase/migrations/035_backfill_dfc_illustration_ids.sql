-- Backfill illustration_id on printings for DFCs and other multi-face cards.
-- Scryfall puts illustration_id on card_faces, not on the top-level printing
-- for these layouts. Copy the front face (face_index=0) illustration_id.
UPDATE printings p
SET illustration_id = cf.illustration_id
FROM card_faces cf
WHERE cf.scryfall_id = p.scryfall_id
  AND cf.face_index = 0
  AND p.illustration_id IS NULL
  AND cf.illustration_id IS NOT NULL;
