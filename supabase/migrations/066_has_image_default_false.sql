-- Fix: new printings should default to has_image=FALSE
-- The image downloader sets has_image=TRUE after successful upload.
-- Previous default of TRUE meant new cards were skipped by the downloader.
ALTER TABLE printings ALTER COLUMN has_image SET DEFAULT FALSE;
