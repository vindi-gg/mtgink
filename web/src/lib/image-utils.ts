const CDN = process.env.NEXT_PUBLIC_CDN_URL || "/api/images";

export function artCropUrl(setCode: string, collectorNumber: string, version?: string | null): string {
  const base = `${CDN}/${setCode}/${collectorNumber}_art_crop.jpg`;
  return version ? `${base}?v=${version}` : base;
}

export function normalCardUrl(setCode: string, collectorNumber: string, version?: string | null): string {
  const base = `${CDN}/${setCode}/${collectorNumber}_normal.jpg`;
  return version ? `${base}?v=${version}` : base;
}
