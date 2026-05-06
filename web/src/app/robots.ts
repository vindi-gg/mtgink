import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/showdown",
        "/auth",
        "/brew",
        "/deck-import",
        "/api/",
        // Tag pages — 16k+ thin landing pages that don't drive search
        // traffic. Excluded so crawl budget concentrates on cards / sets / artists.
        "/db/tags",
        "/db/art-tags",
      ],
    },
    sitemap: "https://mtg.ink/sitemap.xml",
  };
}
