import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/is-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/admin/events/[id]
 * Body: { action: "hide" | "unhide" | "close" }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action as "hide" | "unhide" | "close" | undefined;
  if (!action) return NextResponse.json({ error: "missing_action" }, { status: 400 });

  const statusByAction = { hide: "hidden", unhide: "published", close: "closed" } as const;

  const db = createAdminClient();
  await db.from("events").update({ status: statusByAction[action] }).eq("id", eventId);

  return NextResponse.json({ status: "ok" });
}
