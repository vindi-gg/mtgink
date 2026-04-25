const BASE_URL = "https://mtg.ink";
const PAGE_SIZE = 1000;

export interface SitemapEntry {
  loc: string;
  priority?: number;
  lastmod?: string;
}

export function buildSitemap(urls: SitemapEntry[]): Response {
  const entries = urls.map((u) => {
    const parts = [`<loc>${BASE_URL}${u.loc}</loc>`];
    if (u.lastmod) parts.push(`<lastmod>${u.lastmod}</lastmod>`);
    if (u.priority != null) parts.push(`<priority>${u.priority}</priority>`);
    return `  <url>${parts.join("")}</url>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}

export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}
