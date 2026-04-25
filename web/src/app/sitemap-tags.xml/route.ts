import { getAdminClient } from "@/lib/supabase/admin";
import { buildSitemap, fetchAllRows } from "@/lib/sitemap-utils";

export const revalidate = 86400;

export async function GET() {
  const lastmod = new Date().toISOString();
  const rows = await fetchAllRows<{ slug: string }>((from, to) =>
    getAdminClient()
      .from("tags")
      .select("slug")
      .eq("type", "oracle")
      .order("label")
      .range(from, to),
  );
  return buildSitemap(rows.map((t) => ({ loc: `/db/tags/${t.slug}`, priority: 0.5, lastmod })));
}
