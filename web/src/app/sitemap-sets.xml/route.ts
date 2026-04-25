import { getAdminClient } from "@/lib/supabase/admin";
import { buildSitemap, fetchAllRows } from "@/lib/sitemap-utils";

export const revalidate = 86400;

export async function GET() {
  const lastmod = new Date().toISOString();
  const rows = await fetchAllRows<{ set_code: string }>((from, to) =>
    getAdminClient()
      .from("sets")
      .select("set_code")
      .order("released_at", { ascending: false })
      .range(from, to),
  );
  return buildSitemap(rows.map((s) => ({ loc: `/db/expansions/${s.set_code}`, priority: 0.6, lastmod })));
}
