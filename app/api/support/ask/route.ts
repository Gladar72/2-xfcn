import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupportAiReply } from "@/lib/telegram/support-ai";
import { getBot } from "@/lib/telegram/bot";
import { ticketTag } from "@/lib/support/tickets";

/**
 * POST /api/support/ask  Body: { message: string, human?: boolean }
 * Мося-помощник в приложении: тот же ИИ и та же запись обращений, что и в
 * чате поддержки бота (support_tickets + копия администратору в Telegram).
 * human: true — человек сам попросил живого сотрудника: вопрос сразу уходит
 * администратору. Обращения привязаны к аккаунту (user_id) — так поддержка
 * работает и у тех, кто вошёл по телефону или почте, без Telegram.
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1000) : "";
  const wantsHuman = body?.human === true;
  if (message.length < 2) return NextResponse.json({ error: "empty" }, { status: 400 });

  const admin = createAdminClient();
  const { data: user } = await admin
    .from("users")
    .select("name, telegram_username, telegram_id, phone, email")
    .eq("id", currentUser.userId)
    .maybeSingle();
  const telegramId = (user?.telegram_id as number | null | undefined) ?? null;

  const { data: recent } = await admin
    .from("support_tickets")
    .select("message, bot_reply")
    .eq("user_id", currentUser.userId)
    .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(4);
  const history = ((recent ?? []) as { message: string; bot_reply: string | null }[]).reverse();

  // «Позвать человека» — не чаще раза в 10 минут: иначе каждое сообщение летит админу.
  let throttled = false;
  if (wantsHuman) {
    const { count } = await admin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUser.userId)
      .eq("source", "app")
      .is("admin_reply", null)
      .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .like("bot_reply", "Передала твой вопрос команде%");
    throttled = (count ?? 0) > 0;
  }

  const ai = throttled
    ? { reply: "Уже передала команде — ответ скоро придёт сюда. Подробности сохранила 🙌", needsHuman: false }
    : wantsHuman
    ? { reply: "Передала твой вопрос команде МЕСТО — ответ придёт сюда и уведомлением. Обычно отвечаем в течение дня 🧡", needsHuman: true }
    : await getSupportAiReply(message, history);

  let ticketId: string | null = null;
  try {
    const { data } = await admin
      .from("support_tickets")
      .insert({
        user_id: currentUser.userId,
        telegram_id: telegramId,
        username: (user?.telegram_username as string | null) ?? null,
        first_name: (user?.name as string | null) ?? null,
        message,
        bot_reply: ai.reply,
        source: "app",
      })
      .select("id, created_at")
      .single();
    ticketId = (data?.id as string | undefined) ?? null;
  } catch (err) {
    console.error("support ask: не удалось сохранить обращение", err);
  }

  const adminRaw = (process.env.ADMIN_TELEGRAM_IDS ?? "").split(",")[0]?.trim();
  const adminId = adminRaw && !Number.isNaN(Number(adminRaw)) ? Number(adminRaw) : null;
  if (ai.needsHuman && adminId) {
    const contact = user?.telegram_username ? `@${user.telegram_username}` : (user?.phone as string | null) ?? (user?.email as string | null) ?? "";
    const who = `${(user?.name as string | undefined) ?? "пользователь"}${contact ? ` (${contact})` : ""}`;
    await getBot()
      .api.sendMessage(
        adminId,
        `📩 ${wantsHuman ? "Просит живого сотрудника" : "Вопрос Мосе"} в приложении от ${who}:\n\n${message}\n\n— Ответ: ${ai.reply}` +
          (ticketId ? `\n\n↩️ Ответь на это сообщение, чтобы написать человеку в приложение. ${ticketTag(ticketId)}` : "")
      )
      .catch((err) => console.error("support ask: не удалось переслать админу", err));
  }

  return NextResponse.json({ reply: ai.reply, ticketId, forwarded: ai.needsHuman && !!adminId });
}
