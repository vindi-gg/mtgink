import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/showdown", "/auth", "/brew", "/deck-import", "/api/"],
    },
    sitemap: "https://mtg.ink/sitemap-index.xml",
  };
}
