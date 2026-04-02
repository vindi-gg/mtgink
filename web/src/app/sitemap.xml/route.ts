import { getAdminClient } from "@/lib/supabase/admin";

const BASE_URL = "https://mtg.ink";
const CARDS_PER_CHUNK = 5000;

export const revalidate = 86400;

export async function GET() {
  const admin = getAdminClient();
  const { count: cardCount } = await admin
    .from("oracle_cards")
    .select("*", { count: "exact", head: true });

  const cardChunks = Math.ceil((cardCount ?? 37000) / CARDS_PER_CHUNK);
  const totalChunks = cardChunks + 6; // 0=static, 1-N=cards, N+1=sets, N+2=tags, N+3=tribes, N+4=artists, N+5=art-tags

  const entries = Array.from({ length: totalChunks }, (_, i) =>
    `  <sitemap><loc>${BASE_URL}/sitemap/${i}.xml</loc></sitemap>`
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
