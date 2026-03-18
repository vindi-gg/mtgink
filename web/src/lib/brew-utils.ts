import type { Brew } from "./types";

/** Build the showdown URL a brew should launch */
export function brewToShowdownUrl(brew: Brew): string {
  const route =
    brew.mode === "remix" && brew.source === "card"
      ? "remix"
      : brew.mode === "vs"
        ? "vs"
        : "gauntlet";

  return `/showdown/${route}?brew=${brew.slug}`;
}
