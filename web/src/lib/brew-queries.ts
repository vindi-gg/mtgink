import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  slugify,
  getGauntletIllustrations,
  getGauntletIllustrationsByArtist,
  getGauntletCardsByTag,
  getGauntletCards,
  getGauntletIllustrationsBySet,
} from "./queries";
import type { Brew, GauntletEntry, CompareFilters } from "./types";

function randomHex(n: number): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * 16)];
  return out;
}

async function generateSlug(name: string): Promise<string> {
  const base = slugify(name);
  const admin = getAdminClient();

  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = `${base}-${randomHex(4)}`;
    const { data } = await admin
      .from("brews")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  // Fallback with 8 hex chars
  return `${base}-${randomHex(8)}`;
}

export async function createBrew(params: {
  userId: string | null;
  name: string;
  description?: string;
  mode: string;
  source: string;
  sourceId: string;
  sourceLabel: string;
  colors?: string[];
  cardType?: string;
  subtype?: string;
  rulesText?: string;
  rarity?: string;
  poolSize?: number;
  bracketSize?: number;
  isPublic?: boolean;
}): Promise<{ id: string; slug: string }> {
  const admin = getAdminClient();
  const slug = await generateSlug(params.name);

  // Fetch preview image
  const preview = await getBrewPreviewImage(params.source, params.sourceId);

  // Resolve the pool from the brew's source + filters at creation time.
  // For bracket brews the client sends poolSize = bracketSize (see
  // buildBrewPayload in BrewCreateForm), so resolveBrewPool returns
  // bracketSize cards; the DB row stores the size in bracket_size and
  // leaves pool_size null.
  const pool = await resolveBrewPool(params);

  const { data, error } = await admin
    .from("brews")
    .insert({
      user_id: params.userId,
      name: params.name,
      description: params.description ?? null,
      mode: params.mode,
      source: params.source,
      source_id: params.sourceId,
      source_label: params.sourceLabel,
      colors: params.colors && params.colors.length > 0 ? params.colors : null,
      card_type: params.cardType ?? null,
      subtype: params.subtype ?? null,
      rules_text: params.rulesText ?? null,
      rarity: params.rarity ?? null,
      // Bracket brews track size via bracket_size; leave pool_size null so we
      // don't trip the gauntlet-oriented pool_size bound.
      pool_size: params.mode === "bracket" ? null : (params.poolSize ?? null),
      bracket_size: params.mode === "bracket" ? params.bracketSize ?? null : null,
      pool,
      is_public: params.isPublic !== false,
      slug,
      preview_set_code: preview?.set_code ?? null,
      preview_collector_number: preview?.collector_number ?? null,
      preview_image_version: preview?.image_version ?? null,
    })
    .select("id, slug")
    .single();

  if (error) throw new Error(`Failed to create brew: ${error.message}`);
  return { id: data.id, slug: data.slug };
}

/** Resolve the full card pool for a brew at creation time */
export async function resolveBrewPool(params: {
  mode: string;
  source: string;
  sourceId: string;
  colors?: string[];
  cardType?: string;
  subtype?: string;
  rulesText?: string;
  rarity?: string;
  poolSize?: number;
  includeChildren?: boolean;
  onlyNewCards?: boolean;
  firstIllustrationOnly?: boolean;
}): Promise<GauntletEntry[]> {
  const ps = params.poolSize ?? 10;
  const filters: CompareFilters = {
    colors: params.colors,
    type: params.cardType ?? undefined,
    subtype: params.subtype ?? undefined,
    rules_text: params.rulesText ?? undefined,
    rarity: params.rarity ?? undefined,
  };

  if (params.source === "card") {
    return getGauntletIllustrations(params.sourceId);
  }

  if (params.source === "artist") {
    return getGauntletIllustrationsByArtist(params.sourceId, ps);
  }

  if (params.source === "tag") {
    let pool = await getGauntletCardsByTag(params.sourceId, ps * 5);
    // Apply filters
    if (params.colors?.length || params.cardType || params.subtype) {
      pool = pool.filter((entry) => {
        if (params.colors?.length && entry.mana_cost) {
          if (!params.colors.every((c) => entry.mana_cost?.includes(`{${c}}`))) return false;
        }
        if (params.cardType && entry.type_line && !entry.type_line.includes(params.cardType)) return false;
        if (params.subtype && entry.type_line && !entry.type_line.includes(params.subtype)) return false;
        return true;
      });
    }
    // Shuffle and trim
    return pool.sort(() => Math.random() - 0.5).slice(0, ps);
  }

  // "expansion" — use illustration-based query (includes alt art)
  if (params.source === "expansion") {
    return getGauntletIllustrationsBySet(params.sourceId, ps, {
      colors: params.colors,
      type: params.cardType,
      subtype: params.subtype,
      rulesText: params.rulesText,
      rarity: params.rarity,
      includeChildren: params.includeChildren,
      onlyNewCards: params.onlyNewCards,
      firstIllustrationOnly: params.firstIllustrationOnly,
    });
  }

  // "all", "tribe"
  if (params.source === "tribe") {
    filters.type = "Creature";
    filters.subtype = params.sourceId;
  }

  return getGauntletCards(ps, filters);
}

export async function getBrewBySlug(slug: string): Promise<Brew | null> {
  const { data } = await getAdminClient()
    .from("brews")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data as Brew | null;
}

export async function listPublicBrews(
  sort: "popular" | "newest" = "popular",
  limit = 20,
  offset = 0,
  search?: string,
  mode?: string,
): Promise<{ brews: Brew[]; total: number }> {
  const admin = getAdminClient();

  let countQuery = admin
    .from("brews")
    .select("*", { count: "exact", head: true })
    .eq("is_public", true);
  if (search) countQuery = countQuery.ilike("name", `%${search}%`);
  if (mode) countQuery = countQuery.eq("mode", mode);
  const { count } = await countQuery;

  const orderCol = sort === "popular" ? "play_count" : "created_at";
  let dataQuery = admin
    .from("brews")
    .select("*")
    .eq("is_public", true)
    .order(orderCol, { ascending: false })
    .range(offset, offset + limit - 1);
  if (search) dataQuery = dataQuery.ilike("name", `%${search}%`);
  if (mode) dataQuery = dataQuery.eq("mode", mode);
  const { data } = await dataQuery;

  return { brews: (data ?? []) as Brew[], total: count ?? 0 };
}

export async function getBrewsByUser(
  userId: string
): Promise<Brew[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("brews")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []) as Brew[];
}

export async function updateBrew(
  brewId: string,
  updates: { name?: string; description?: string; isPublic?: boolean }
): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined)
    updateData.description = updates.description;
  if (updates.isPublic !== undefined) updateData.is_public = updates.isPublic;

  await supabase.from("brews").update(updateData).eq("id", brewId);
}

export async function deleteBrew(brewId: string): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.from("brews").delete().eq("id", brewId);
}

export async function incrementPlayCount(brewId: string): Promise<void> {
  await getAdminClient().rpc("increment_brew_play_count", {
    p_brew_id: brewId,
  });
}

async function getBrewPreviewImage(
  source: string,
  sourceId: string
): Promise<{
  set_code: string;
  collector_number: string;
  image_version: string | null;
} | null> {
  const admin = getAdminClient();

  if (source === "card") {
    // Get top-rated illustration for this card
    const { data } = await admin
      .from("printings")
      .select("set_code, collector_number, image_version")
      .eq("oracle_id", sourceId)
      .order("released_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  }

  if (source === "expansion") {
    const { data } = await admin
      .from("printings")
      .select("set_code, collector_number, image_version")
      .eq("set_code", sourceId)
      .limit(1)
      .maybeSingle();
    return data ?? null;
  }

  if (source === "artist") {
    const { data } = await admin
      .from("printings")
      .select("set_code, collector_number, image_version")
      .eq("artist", sourceId)
      .order("released_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  }

  if (source === "tribe") {
    const { data } = await admin
      .from("printings")
      .select("set_code, collector_number, image_version, oracle_cards!inner(type_line)")
      .ilike("oracle_cards.type_line", `%${sourceId}%`)
      .limit(1)
      .maybeSingle();
    if (data) return { set_code: data.set_code, collector_number: data.collector_number, image_version: data.image_version };
    return null;
  }

  if (source === "tag") {
    // Try illustration_tags first (scryfall tags)
    const { data: illTag } = await admin
      .from("illustration_tags")
      .select("illustration_id")
      .eq("tag_id", sourceId)
      .limit(1)
      .maybeSingle();
    if (illTag) {
      const { data: printing } = await admin
        .from("printings")
        .select("set_code, collector_number, image_version")
        .eq("illustration_id", illTag.illustration_id)
        .limit(1)
        .maybeSingle();
      if (printing) return printing;
    }
    // Fall back to oracle_tags (ink tags)
    const { data: oracleTag } = await admin
      .from("oracle_tags")
      .select("oracle_id")
      .eq("tag_id", sourceId)
      .limit(1)
      .maybeSingle();
    if (oracleTag) {
      const { data: printing } = await admin
        .from("printings")
        .select("set_code, collector_number, image_version")
        .eq("oracle_id", oracleTag.oracle_id)
        .limit(1)
        .maybeSingle();
      return printing ?? null;
    }
    return null;
  }

  return null;
}
