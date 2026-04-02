import { getAdminClient } from "@/lib/supabase/admin";

const BASE_URL = "https://mtg.ink";

export const revalidate = 86400;

export async function GET() {
  const admin = getAdminClient();

  const [
    { data: cards },
    { data: sets },
    { data: oracleTags },
    { data: artTags },
    { data: tribes },
    { data: artists },
  ] = await Promise.all([
    admin.from("oracle_cards").select("slug").order("name"),
    admin.from("sets").select("set_code").order("released_at", { ascending: false }),
    admin.from("tags").select("slug").eq("type", "oracle").order("label"),
    admin.from("tags").select("slug").eq("type", "illustration").order("label"),
    admin.rpc("get_creature_tribes"),
    admin.from("artists").select("slug").order("name"),
  ]);

  const urls: string[] = [];

  // Static pages
  for (const path of ["", "/db/expansions", "/db/cards", "/db/tags", "/db/art-tags", "/db/tribes", "/artists"]) {
    urls.push(`  <url><loc>${BASE_URL}${path || "/"}</loc><priority>${path ? "0.7" : "1.0"}</priority></url>`);
  }

  for (const c of cards ?? []) {
    urls.push(`  <url><loc>${BASE_URL}/card/${c.slug}</loc><priority>0.8</priority></url>`);
  }

  for (const s of sets ?? []) {
    urls.push(`  <url><loc>${BASE_URL}/db/expansions/${s.set_code}</loc><priority>0.6</priority></url>`);
  }

  for (const t of oracleTags ?? []) {
    urls.push(`  <url><loc>${BASE_URL}/db/tags/${t.slug}</loc><priority>0.5</priority></url>`);
  }

  for (const t of artTags ?? []) {
    urls.push(`  <url><loc>${BASE_URL}/db/art-tags/${t.slug}</loc><priority>0.5</priority></url>`);
  }

  for (const t of (tribes ?? []) as { slug: string }[]) {
    urls.push(`  <url><loc>${BASE_URL}/db/tribes/${t.slug}</loc><priority>0.5</priority></url>`);
  }

  for (const a of artists ?? []) {
    urls.push(`  <url><loc>${BASE_URL}/artists/${a.slug}</loc><priority>0.6</priority></url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
