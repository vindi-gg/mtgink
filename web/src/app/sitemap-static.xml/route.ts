import { buildSitemap } from "@/lib/sitemap-utils";
export const revalidate = 86400;
export async function GET() {
  return buildSitemap([
    { loc: "/", priority: 1.0 },
    { loc: "/db/expansions", priority: 0.7 },
    { loc: "/db/cards", priority: 0.7 },
    { loc: "/db/tags", priority: 0.6 },
    { loc: "/db/art-tags", priority: 0.6 },
    { loc: "/db/tribes", priority: 0.6 },
    { loc: "/artists", priority: 0.7 },
  ]);
}
