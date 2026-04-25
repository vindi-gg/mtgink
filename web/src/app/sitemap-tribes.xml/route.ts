import { getAdminClient } from "@/lib/supabase/admin";
import { buildSitemap } from "@/lib/sitemap-utils";

export const revalidate = 86400;

export async function GET() {
  const lastmod = new Date().toISOString();
  const { data } = await getAdminClient().rpc("get_creature_tribes");
  return buildSitemap(
    ((data ?? []) as { slug: string }[]).map((t) => ({ loc: `/db/tribes/${t.slug}`, priority: 0.5, lastmod })),
  );
}
