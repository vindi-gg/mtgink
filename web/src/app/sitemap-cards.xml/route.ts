import { getAdminClient } from "@/lib/supabase/admin";
import { buildSitemap, fetchAllRows } from "@/lib/sitemap-utils";

export const revalidate = 86400;

export async function GET() {
  const lastmod = new Date().toISOString();
  const rows = await fetchAllRows<{ slug: string }>((from, to) =>
    getAdminClient()
      .from("oracle_cards")
      .select("slug")
      .not("slug", "is", null)
      .neq("slug", "")
      .order("name")
      .range(from, to),
  );
  return buildSitemap(rows.map((c) => ({ loc: `/card/${c.slug}`, priority: 0.8, lastmod })));
}
