import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastToConversation } from "@/lib/supabase/broadcast";
import { sendPushToUsers } from "@/lib/push/expo";
import { runInBackground } from "@/lib/server/background";

const question = z.object({ text: z.string().trim().min(1).max(1500), messageId: z.string().uuid() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const input = question.safeParse(await req.json().catch(() => null));
  if (!input.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_question" }, { status: 400 });
  }
  const admin = createAdminClient({ noStore: true });
  const { data, error } = await admin.rpc("send_business_event_question", {
    p_event: id, p_sender: user.userId, p_message: input.data.messageId, p_text: input.data.text,
  });
  if (error || !data) return NextResponse.json({ error: "send_failed" }, { status: 503 });
  if (data.error) {
    const status = data.error === "blocked" ? 403 : data.error === "event_unavailable" ? 404 : data.error === "message_id_conflict" ? 409 : 400;
    return NextResponse.json({ error: data.error }, { status });
  }
  const conversationId = data.conversationId as string;
  if (!data.duplicate) {
    await runInBackground(() => Promise.all([
      broadcastToConversation(conversationId, "message", {
        id: input.data.messageId, senderId: user.userId, content: data.content, createdAt: data.createdAt,
        imageUrl: null, deleted: false, editedAt: null, replyTo: null, reactions: [],
      }),
      sendPushToUsers(admin, [data.host], {
        title: "Вопрос о событии", body: data.content.slice(0,150), data: { url: `/chat/${conversationId}`, conversationId, type: "new_message" },
      }),
    ]));
  }
  return NextResponse.json({ conversationId });
}
