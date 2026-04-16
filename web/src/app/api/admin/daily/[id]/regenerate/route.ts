import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  getGauntletIllustrations,
  getGauntletIllustrationsByArtist,
  getGauntletIllustrationsBySet,
  getGauntletCardsByTag,
  getGauntletCards,
} from "@/lib/queries";

const POOL_SIZE = 10;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const themeId = body.theme_id;

  if (!themeId) {
    return NextResponse.json({ error: "theme_id required" }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Load theme
  const { data: theme } = await supabase
    .from("gauntlet_themes")
    .select("*")
    .eq("id", themeId)
    .single();

  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  // Generate pool based on theme type
  let pool;
  let gauntletMode: "remix" | "vs" = theme.pool_mode || "vs";
  let title = theme.label;
  let description = theme.description || null;

  if (theme.theme_type === "card_remix" && theme.oracle_id) {
    pool = await getGauntletIllustrations(theme.oracle_id);
    gauntletMode = "remix";
  } else if (theme.theme_type === "artist" && theme.artist) {
    pool = await getGauntletIllustrationsByArtist(theme.artist, POOL_SIZE);
    gauntletMode = "remix";
  } else if (theme.theme_type === "set" && theme.set_code) {
    pool = await getGauntletIllustrationsBySet(theme.set_code, POOL_SIZE);
  } else if ((theme.theme_type === "tag" || theme.theme_type === "art_tag") && theme.tag_id) {
    pool = await getGauntletCardsByTag(theme.tag_id, POOL_SIZE);
  } else if (theme.theme_type === "tribe" && theme.tribe) {
    pool = await getGauntletCards(POOL_SIZE, { type: "Creature", subtype: theme.tribe });
  } else {
    pool = await getGauntletCards(POOL_SIZE);
  }

  if (!pool || pool.length < 2) {
    return NextResponse.json({ error: "Could not generate pool (not enough cards)" }, { status: 422 });
  }

  // Pick preview image from first pool entry
  const preview = pool[0];

  // Update the challenge
  const { data: updated, error } = await supabase
    .from("daily_challenges")
    .update({
      pool,
      title,
      description,
      theme_id: themeId,
      gauntlet_mode: gauntletMode,
      preview_set_code: preview.set_code,
      preview_collector_number: preview.collector_number,
      preview_image_version: preview.image_version,
    })
    .eq("id", parseInt(id))
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/daily/bracket");
  revalidatePath("/daily/gauntlet");
  revalidatePath("/daily/bracket/results");
  revalidatePath("/daily/gauntlet/results");

  return NextResponse.json({ challenge: updated });
}
