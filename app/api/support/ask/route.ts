import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupportAiReply } from "@/lib/telegram/support-ai";
import { getBot } from "@/lib/telegram/bot";

/**
 * POST /api/support/ask  Body: { message: string }
 * Мося-помощник в приложении: тот же ИИ и та же запись обращений, что и в
 * чате поддержки бота (support_tickets + копия администратору в Telegram).
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1000) : "";
  if (message.length < 2) return NextResponse.json({ error: "empty" }, { status: 400 });

  const admin = createAdminClient();
  const { data: user } = await admin.from("users").select("name, telegram_username").eq("id", currentUser.userId).maybeSingle();

  const { data: recent } = await admin
    .from("support_tickets")
    .select("message, bot_reply")
    .eq("telegram_id", currentUser.telegramId)
    .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(4);
  const history = ((recent ?? []) as { message: string; bot_reply: string | null }[]).reverse();

  const { reply, needsHuman } = await getSupportAiReply(message, history);

  try {
    await admin.from("support_tickets").insert({
      telegram_id: currentUser.telegramId,
      username: (user?.telegram_username as string | null) ?? null,
      first_name: (user?.name as string | null) ?? null,
      message,
      bot_reply: reply,
    });
  } catch (err) {
    console.error("support ask: не удалось сохранить обращение", err);
  }

  const adminRaw = (process.env.ADMIN_TELEGRAM_IDS ?? "").split(",")[0]?.trim();
  const adminId = adminRaw && !Number.isNaN(Number(adminRaw)) ? Number(adminRaw) : null;
  if (needsHuman && adminId) {
    const who = user?.telegram_username ? `@${user.telegram_username}` : (user?.name as string | undefined) ?? "пользователь";
    await getBot()
      .api.sendMessage(adminId, `📩 Вопрос Мосе в приложении от ${who} (id ${currentUser.telegramId}):\n\n${message}\n\n— Ответ: ${reply}`)
      .catch((err) => console.error("support ask: не удалось переслать админу", err));
  }

  return NextResponse.json({ reply });
}
