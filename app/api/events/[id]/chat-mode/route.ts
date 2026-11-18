import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!z.string().uuid().safeParse(id).success || typeof body?.enabled !== "boolean")
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
  const admin = createAdminClient({ noStore: true });
  const { data, error } = await admin.rpc("set_business_chat", { p_event: id, p_owner: user.userId, p_enabled: body.enabled });
  if (error || !data) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (data.error) return NextResponse.json({ error: data.error }, { status: 404 });
  return NextResponse.json(data);
}
