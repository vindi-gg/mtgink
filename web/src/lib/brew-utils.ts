import type { Brew } from "./types";

/** Build the play URL a brew should launch */
export function brewToShowdownUrl(brew: Brew): string {
  if (brew.mode === "bracket") {
    return `/bracket?brew=${brew.slug}`;
  }

  const route =
    brew.mode === "remix" && brew.source === "card"
      ? "remix"
      : brew.mode === "vs"
        ? "vs"
        : "gauntlet";

  return `/showdown/${route}?brew=${brew.slug}`;
}
