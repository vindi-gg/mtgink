import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { identity_id } = await request.json();
  if (!identity_id) {
    return NextResponse.json({ error: "Missing identity_id" }, { status: 400 });
  }

  // Safety check: don't allow unlinking the last identity
  if ((user.identities?.length ?? 0) <= 1) {
    return NextResponse.json({ error: "Cannot unlink your only sign-in method" }, { status: 400 });
  }

  // Verify this identity belongs to this user
  const identity = user.identities?.find((i) => i.identity_id === identity_id);
  if (!identity) {
    return NextResponse.json({ error: "Identity not found" }, { status: 404 });
  }

  // Delete via RPC (avoids admin auth API JWT issues on local Supabase)
  const { error } = await getAdminClient().rpc("delete_user_identity", {
    p_user_id: user.id,
    p_identity_id: identity_id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
