import { getAdminClient } from "@/lib/supabase/admin";
import { buildSitemap } from "@/lib/sitemap-utils";
export const revalidate = 86400;
export async function GET() {
  const { data } = await getAdminClient().from("oracle_cards").select("slug").order("name");
  return buildSitemap((data ?? []).map((c) => ({ loc: `/card/${c.slug}`, priority: 0.8 })));
}
