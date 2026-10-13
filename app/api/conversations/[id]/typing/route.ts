import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastToConversation } from "@/lib/supabase/broadcast";
import { chatAccess } from "@/lib/chat/access";

/**
 * POST /api/conversations/[id]/typing
 * «Печатает…»: клиент шлёт не чаще раза в 3 секунды, сервер рассылает участникам.
 * Писать в канал напрямую клиенты не могут (нет политики на запись в realtime.messages).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const access = await chatAccess(admin, conversationId, currentUser.userId);
  if (!access.member) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (access.blocked || access.closed) return NextResponse.json({ status: "ok" });

  const name = access.name;
  await broadcastToConversation(conversationId, "typing", { userId: currentUser.userId, name: name.split(" ")[0] });
  return NextResponse.json({ status: "ok" });
}
