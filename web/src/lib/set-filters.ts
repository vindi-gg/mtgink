import type { SetCard } from "./types";

export type PrintingFilter = "all" | "new" | "reprints";

export interface SetFilterParams {
  rarities: Set<string>;
  printing: PrintingFilter;
}

export function parseSetFilterParams(sp: URLSearchParams | null | undefined): SetFilterParams {
  const raritiesRaw = sp?.get("rarities") ?? "";
  const rarities = new Set(raritiesRaw.split(",").map((s) => s.trim()).filter(Boolean));
  const printingRaw = sp?.get("printing") ?? "all";
  const printing: PrintingFilter = printingRaw === "new" || printingRaw === "reprints" ? printingRaw : "all";
  return { rarities, printing };
}

export function applySetFilters(cards: SetCard[], params: SetFilterParams): SetCard[] {
  let result = cards;
  if (params.rarities.size > 0) {
    result = result.filter((c) => params.rarities.has(c.rarity ?? "common"));
  }
  if (params.printing === "new") {
    result = result.filter((c) => !c.is_reprint);
  } else if (params.printing === "reprints") {
    result = result.filter((c) => c.is_reprint);
  }
  return result;
}

export function setFilterParamsToSearchString(params: SetFilterParams): string {
  const sp = new URLSearchParams();
  if (params.rarities.size > 0) {
    sp.set("rarities", Array.from(params.rarities).join(","));
  }
  if (params.printing !== "all") {
    sp.set("printing", params.printing);
  }
  return sp.toString();
}
