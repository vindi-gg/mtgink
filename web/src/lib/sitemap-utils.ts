const BASE_URL = "https://mtg.ink";

export function buildSitemap(urls: { loc: string; priority?: number }[]): Response {
  const entries = urls.map((u) =>
    `  <url><loc>${BASE_URL}${u.loc}</loc>${u.priority != null ? `<priority>${u.priority}</priority>` : ""}</url>`
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
