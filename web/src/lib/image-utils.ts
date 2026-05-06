const CDN = process.env.NEXT_PUBLIC_CDN_URL || "/api/images";

export function artCropUrl(setCode: string, collectorNumber: string, version?: string | null): string {
  const base = `${CDN}/${setCode}/${collectorNumber}_art_crop.jpg`;
  return version ? `${base}?v=${version}` : base;
}

export function normalCardUrl(setCode: string, collectorNumber: string, version?: string | null): string {
  const base = `${CDN}/${setCode}/${collectorNumber}_normal.jpg`;
  return version ? `${base}?v=${version}` : base;
}

/** Locally-mirrored Scryfall `large` size — 672×936 JPG (~217 KB). Used by
 *  the lightbox for full-art prints where extra resolution matters. Mirrored
 *  via `scripts/download_images.py --types large` so we never hotlink. */
export function largeCardUrl(setCode: string, collectorNumber: string, version?: string | null): string {
  const base = `${CDN}/${setCode}/${collectorNumber}_large.jpg`;
  return version ? `${base}?v=${version}` : base;
}
