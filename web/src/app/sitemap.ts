import type { MetadataRoute } from "next";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BASE_URL = "https://mtg.ink";
const CARDS_PER_CHUNK = 5000;

// Chunk IDs:
// 0 = static pages
// 1-N = card slugs (split into ~5K chunks)
// N+1 = sets
// N+2 = tags (oracle only)
// N+3 = tribes
// N+4 = artists
// N+5 = art tags

export async function generateSitemaps() {
  const admin = getAdminClient();

  const [{ count: cardCount }, { count: setCount }, { count: tagCount }] =
    await Promise.all([
      admin.from("oracle_cards").select("*", { count: "exact", head: true }),
      admin.from("sets").select("*", { count: "exact", head: true }),
      admin
        .from("tags")
        .select("*", { count: "exact", head: true })
        .eq("type", "oracle"),
    ]);

  const cardChunks = Math.ceil((cardCount ?? 37000) / CARDS_PER_CHUNK);

  // 0=static, 1..N=cards, N+1=sets, N+2=tags, N+3=tribes, N+4=artists, N+5=art tags
  const ids: { id: number }[] = [];
  for (let i = 0; i <= cardChunks + 5; i++) {
    ids.push({ id: i });
  }
  // Store counts for sitemap() to use — encoded in IDs:
  // 0 = static, 1..cardChunks = cards, cardChunks+1 = sets, cardChunks+2 = tags, cardChunks+3 = tribes
  void setCount;
  void tagCount;
  return ids;
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const admin = getAdminClient();
  const now = new Date();

  // Static pages
  if (id === 0) {
    return [
      { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0 },
      { url: `${BASE_URL}/db/expansions`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
      { url: `${BASE_URL}/db/tags`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
      { url: `${BASE_URL}/db/tribes`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
      { url: `${BASE_URL}/db/cards`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
      { url: `${BASE_URL}/db/art-tags`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
      { url: `${BASE_URL}/artists`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    ];
  }

  // Figure out how many card chunks exist
  const { count: totalCards } = await admin
    .from("oracle_cards")
    .select("*", { count: "exact", head: true });
  const cardChunks = Math.ceil((totalCards ?? 37000) / CARDS_PER_CHUNK);

  // Card pages (chunks 1..cardChunks)
  if (id >= 1 && id <= cardChunks) {
    const offset = (id - 1) * CARDS_PER_CHUNK;
    const { data: cards } = await admin
      .from("oracle_cards")
      .select("slug")
      .order("name")
      .range(offset, offset + CARDS_PER_CHUNK - 1);

    return (cards ?? []).map((c) => ({
      url: `${BASE_URL}/card/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  }

  // Sets (cardChunks + 1)
  if (id === cardChunks + 1) {
    const { data: sets } = await admin
      .from("sets")
      .select("set_code")
      .order("released_at", { ascending: false });

    return (sets ?? []).map((s) => ({
      url: `${BASE_URL}/db/expansions/${s.set_code}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  }

  // Tags (cardChunks + 2)
  if (id === cardChunks + 2) {
    const { data: tags } = await admin
      .from("tags")
      .select("slug")
      .eq("type", "oracle")
      .order("label");

    return (tags ?? []).map((t) => ({
      url: `${BASE_URL}/db/tags/${t.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  }

  // Tribes (cardChunks + 3)
  if (id === cardChunks + 3) {
    const { data: tribes } = await admin.rpc("get_creature_tribes");

    return (tribes ?? []).map((t: { slug: string }) => ({
      url: `${BASE_URL}/db/tribes/${t.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  }

  // Artists (cardChunks + 4)
  if (id === cardChunks + 4) {
    const { data: artists } = await admin
      .from("artists")
      .select("slug")
      .order("name");

    return (artists ?? []).map((a) => ({
      url: `${BASE_URL}/artists/${a.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  }

  // Art tags (cardChunks + 5)
  if (id === cardChunks + 5) {
    const { data: artTags } = await admin
      .from("tags")
      .select("slug")
      .eq("type", "illustration")
      .order("label");

    return (artTags ?? []).map((t) => ({
      url: `${BASE_URL}/db/art-tags/${t.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  }

  return [];
}
