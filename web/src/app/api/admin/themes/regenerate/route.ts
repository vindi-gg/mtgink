import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

async function upsertTheme(admin: ReturnType<typeof getAdminClient>, theme: Record<string, unknown>) {
  // Try to find existing by type + identifier
  let query = admin.from("gauntlet_themes").select("id").eq("theme_type", theme.theme_type as string);
  if (theme.tribe) query = query.eq("tribe", theme.tribe as string);
  else if (theme.artist) query = query.eq("artist", theme.artist as string);
  else if (theme.tag_id) query = query.eq("tag_id", theme.tag_id as string);
  else if (theme.oracle_id) query = query.eq("oracle_id", theme.oracle_id as string);

  const { data: existing } = await query.limit(1).maybeSingle();

  if (existing) {
    await admin.from("gauntlet_themes").update({ ...theme, is_active: true }).eq("id", existing.id);
  } else {
    await admin.from("gauntlet_themes").insert({ ...theme, is_active: true });
  }
}

export async function POST() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 500 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.user_metadata?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getAdminClient();

  // Step 1: Mark all inactive
  await admin.from("gauntlet_themes").update({ is_active: false }).neq("id", 0);

  // Step 2: Upsert all valid themes (reactivates existing, inserts new)

  // Tribes with 10+ cards
  const { data: tribes } = await admin.rpc("get_creature_tribes");
  let tribeCount = 0;
  for (const t of (tribes ?? []) as { tribe: string; card_count: number }[]) {
    if (t.card_count < 10) continue;
    await upsertTheme(admin, {
      theme_type: "tribe", pool_mode: "vs",
      label: `${t.tribe} Gauntlet`, description: `Best ${t.tribe} creatures`,
      tribe: t.tribe,
    });
    tribeCount++;
  }

  // Artists with 20+ illustrations
  const { data: artists } = await admin.from("artists").select("name, illustration_count").gte("illustration_count", 20);
  let artistCount = 0;
  for (const a of artists ?? []) {
    const { data: preview } = await admin.from("printings")
      .select("set_code, collector_number, image_version")
      .eq("artist", a.name).not("illustration_id", "is", null)
      .order("released_at", { ascending: false }).limit(1).single();
    await upsertTheme(admin, {
      theme_type: "artist", pool_mode: "vs",
      label: `${a.name} Gauntlet`, description: `Best cards illustrated by ${a.name}`,
      artist: a.name,
      preview_set_code: preview?.set_code, preview_collector_number: preview?.collector_number, preview_image_version: preview?.image_version,
    });
    artistCount++;
  }

  // Oracle tags with 20+ cards
  const { data: tags } = await admin.from("tags").select("tag_id, label, usage_count").eq("type", "oracle").gte("usage_count", 20);
  let tagCount = 0;
  for (const t of tags ?? []) {
    await upsertTheme(admin, {
      theme_type: "tag", pool_mode: "vs",
      label: `${t.label} Gauntlet`, description: `Cards tagged ${t.label}`,
      tag_id: t.tag_id,
    });
    tagCount++;
  }

  // Cards with 5+ illustrations
  const { data: remixCards } = await admin.from("oracle_cards")
    .select("oracle_id, name, illustration_count").gte("illustration_count", 5).neq("layout", "art_series");
  let remixCount = 0;
  for (const c of remixCards ?? []) {
    const { data: preview } = await admin.from("printings")
      .select("set_code, collector_number, image_version")
      .eq("oracle_id", c.oracle_id).not("illustration_id", "is", null)
      .order("released_at", { ascending: false }).limit(1).single();
    await upsertTheme(admin, {
      theme_type: "card_remix", pool_mode: "remix",
      label: `${c.name} Remix`, description: `All art versions of ${c.name}`,
      oracle_id: c.oracle_id, pool_size_estimate: c.illustration_count,
      preview_set_code: preview?.set_code, preview_collector_number: preview?.collector_number, preview_image_version: preview?.image_version,
    });
    remixCount++;
  }

  // Step 3: Delete inactive themes not referenced by any daily challenge
  const { data: referencedIds } = await admin.from("daily_challenges").select("theme_id").not("theme_id", "is", null);
  const referenced = new Set((referencedIds ?? []).map((r) => r.theme_id));

  const { data: inactive } = await admin.from("gauntlet_themes").select("id").eq("is_active", false);
  let deletedCount = 0;
  for (const t of inactive ?? []) {
    if (!referenced.has(t.id)) {
      await admin.from("gauntlet_themes").delete().eq("id", t.id);
      deletedCount++;
    }
  }

  return NextResponse.json({
    success: true,
    message: `Regenerated: ${tribeCount} tribes, ${artistCount} artists, ${tagCount} tags, ${remixCount} remixes. Cleaned up ${deletedCount} stale themes.`,
  });
}
