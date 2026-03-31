/** All routes to test, categorized for different test suites. */

export const STATIC_ROUTES = [
  "/",
  "/db",
  "/db/expansions",
  "/db/cards",
  "/db/tribes",
  "/db/tags",
  "/db/art-tags",
  "/artists",
  "/history",
  "/showdown",
];

export const DYNAMIC_ROUTES = [
  "/card/lightning-bolt",
  "/card/counterspell",
  "/db/expansions/mh3",
  "/db/expansions/woe",
  "/artists/greg-staples",
  "/artists/kev-walker",
  "/db/tribes/dragon",
  "/db/tribes/goblin",
];

export const SHOWDOWN_ROUTES = [
  "/showdown/remix",
  "/showdown/vs",
  "/showdown/gauntlet",
  "/ink",
  "/ink/gauntlet",
];

export const VISUAL_ROUTES = [
  { name: "home", path: "/" },
  { name: "card-detail", path: "/card/lightning-bolt" },
  { name: "expansions", path: "/db/expansions" },
  { name: "set-detail", path: "/db/expansions/mh3" },
  { name: "artist-detail", path: "/artists/greg-staples" },
  { name: "showdown-remix", path: "/showdown/remix" },
  { name: "gauntlet", path: "/showdown/gauntlet" },
];

export const ALL_ROUTES = [
  ...STATIC_ROUTES,
  ...DYNAMIC_ROUTES,
  ...SHOWDOWN_ROUTES,
];
