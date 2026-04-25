const BASE_URL = "https://mtg.ink";

export const revalidate = 86400;

const SUBS = [
  "sitemap-static.xml",
  "sitemap-cards.xml",
  "sitemap-sets.xml",
  "sitemap-tags.xml",
  "sitemap-art-tags.xml",
  "sitemap-tribes.xml",
  "sitemap-artists.xml",
];

export async function GET() {
  const lastmod = new Date().toISOString();
  const entries = SUBS.map((s) =>
    `  <sitemap><loc>${BASE_URL}/${s}</loc><lastmod>${lastmod}</lastmod></sitemap>`
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
