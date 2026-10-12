import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondToInvite } from "@/lib/invites/respond";

/**
 * POST /api/invites/[id]  { action: "accept" | "decline" }
 * Ответ на приглашение организатора с экрана встречи в приложении.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (action !== "accept" && action !== "decline") return NextResponse.json({ error: "invalid_action" }, { status: 400 });

  const result = await respondToInvite(createAdminClient(), { inviteId: params.id, answer: action, userId: currentUser.userId });
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.text }, { status: 422 });
  return NextResponse.json({ status: result.status, message: result.text });
}
