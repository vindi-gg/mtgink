export function artCropUrl(setCode: string, collectorNumber: string): string {
  return `/api/images/${setCode}/${collectorNumber}_art_crop.jpg`;
}

export function normalCardUrl(
  setCode: string,
  collectorNumber: string
): string {
  return `/api/images/${setCode}/${collectorNumber}_normal.jpg`;
}
