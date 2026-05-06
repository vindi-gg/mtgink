import { buildSitemap } from "@/lib/sitemap-utils";

export const revalidate = 86400;

export async function GET() {
  const lastmod = new Date().toISOString();
  return buildSitemap([
    { loc: "/", priority: 1.0, lastmod },
    { loc: "/sets", priority: 0.7, lastmod },
    { loc: "/db/cards", priority: 0.7, lastmod },
    { loc: "/db/tribes", priority: 0.6, lastmod },
    { loc: "/artists", priority: 0.7, lastmod },
  ]);
}
