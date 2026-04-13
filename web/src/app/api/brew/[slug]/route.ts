import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBrewBySlug, updateBrew, deleteBrew } from "@/lib/brew-queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const brew = await getBrewBySlug(slug);
    if (!brew) {
      return NextResponse.json({ error: "Brew not found" }, { status: 404 });
    }

    // If private, check ownership
    if (!brew.is_public) {
      const supabase = await createClient();
      const user = supabase ? (await supabase.auth.getUser()).data.user : null;
      if (!user || user.id !== brew.user_id) {
        return NextResponse.json({ error: "Brew not found" }, { status: 404 });
      }
    }

    return NextResponse.json(brew);
  } catch {
    return NextResponse.json({ error: "Failed to fetch brew" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const brew = await getBrewBySlug(slug);
    const isAdmin = !!user.user_metadata?.is_admin;
    if (!brew || (brew.user_id !== user.id && !isAdmin)) {
      return NextResponse.json({ error: "Brew not found" }, { status: 404 });
    }

    const body = await request.json();
    await updateBrew(brew.id, {
      name: body.name,
      description: body.description,
      isPublic: body.is_public,
      pool: body.pool,
      bracketSize: body.bracket_size,
      poolSize: body.pool_size,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update brew" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const brew = await getBrewBySlug(slug);
    const isAdmin = !!user.user_metadata?.is_admin;
    if (!brew || (brew.user_id !== user.id && !isAdmin)) {
      return NextResponse.json({ error: "Brew not found" }, { status: 404 });
    }

    await deleteBrew(brew.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete brew" }, { status: 500 });
  }
}
