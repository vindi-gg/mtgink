import { getAdminClient } from "@/lib/supabase/admin";
import { buildSitemap } from "@/lib/sitemap-utils";
export const revalidate = 86400;
export async function GET() {
  const { data } = await getAdminClient().from("artists").select("slug").order("name");
  return buildSitemap((data ?? []).map((a) => ({ loc: `/artists/${a.slug}`, priority: 0.6 })));
}
