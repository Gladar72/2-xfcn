import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/is-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/admin/users/[id]
 * Body: { action: "ban" | "unban" }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id: userId } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action as "ban" | "unban" | undefined;
  if (!action) return NextResponse.json({ error: "missing_action" }, { status: 400 });

  const db = createAdminClient();
  const updates =
    action === "ban"
      ? { moderation_status: "banned", banned_at: new Date().toISOString() }
      : { moderation_status: "active", banned_at: null };

  await db.from("users").update(updates).eq("id", userId);

  return NextResponse.json({ status: "ok" });
}
