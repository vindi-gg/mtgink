import { getAdminClient } from "@/lib/supabase/admin";
import { buildSitemap } from "@/lib/sitemap-utils";
export const revalidate = 86400;
export async function GET() {
  const { data } = await getAdminClient().from("sets").select("set_code").order("released_at", { ascending: false });
  return buildSitemap((data ?? []).map((s) => ({ loc: `/db/expansions/${s.set_code}`, priority: 0.6 })));
}
