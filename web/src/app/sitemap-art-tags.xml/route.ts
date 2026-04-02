import { getAdminClient } from "@/lib/supabase/admin";
import { buildSitemap } from "@/lib/sitemap-utils";
export const revalidate = 86400;
export async function GET() {
  const { data } = await getAdminClient().from("tags").select("slug").eq("type", "illustration").order("label");
  return buildSitemap((data ?? []).map((t) => ({ loc: `/db/art-tags/${t.slug}`, priority: 0.5 })));
}
