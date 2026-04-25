import { getAdminClient } from "@/lib/supabase/admin";
import { buildSitemap, fetchAllRows } from "@/lib/sitemap-utils";

export const revalidate = 86400;

export async function GET() {
  const lastmod = new Date().toISOString();
  const rows = await fetchAllRows<{ slug: string }>((from, to) =>
    getAdminClient()
      .from("artists")
      .select("slug")
      .order("name")
      .range(from, to),
  );
  return buildSitemap(rows.map((a) => ({ loc: `/artists/${a.slug}`, priority: 0.6, lastmod })));
}
