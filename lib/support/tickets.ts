import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notify/user";
import { notifyTelegram } from "@/lib/telegram/notify";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Метка обращения в сообщении администратору: «#t:<uuid>». Админ отвечает на
 * такое сообщение в Telegram (reply) — бот находит обращение по метке и
 * доставляет ответ человеку: push в приложение и/или сообщение в боте.
 */
export function ticketTag(id: string): string {
  return `#t:${id}`;
}

const TAG_RE = /#t:([0-9a-f-]{36})/gi;

/** Берём ПОСЛЕДНЮЮ метку: её ставит бот в конце, а текст человека выше может содержать что угодно. */
export function parseTicketTag(text: string | null | undefined): string | null {
  if (!text) return null;
  const all = [...text.matchAll(TAG_RE)];
  return all.length ? all[all.length - 1]![1]! : null;
}

/**
 * Ответ поддержки (человека) на обращение: сохраняем (повторные ответы дописываются)
 * и доставляем. "missing" — обращение не найдено; "saved" — сохранено, увидит в
 * приложении в «Помощи»; "delivered" — ушло push-уведомлением или в Telegram.
 */
export async function deliverAdminReply(admin: Admin, ticketId: string, reply: string): Promise<"missing" | "saved" | "delivered"> {
  const { data: ticket } = await admin
    .from("support_tickets")
    .select("id, user_id, telegram_id, admin_reply")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return "missing";

  const text = reply.trim().slice(0, 2000);
  const prev = (ticket.admin_reply as string | null) ?? "";
  await admin
    .from("support_tickets")
    .update({ admin_reply: prev ? `${prev}\n\n${text}` : text, admin_replied_at: new Date().toISOString(), status: "resolved" })
    .eq("id", ticketId);

  let delivered = !!ticket.telegram_id;
  if (ticket.user_id) {
    const { count } = await admin.from("push_tokens").select("token", { count: "exact", head: true }).eq("user_id", ticket.user_id);
    delivered = delivered || (count ?? 0) > 0;
  }

  if (ticket.user_id) {
    await notifyUser(admin, ticket.user_id as string, {
      title: "Ответ поддержки МЕСТО",
      body: text.length > 140 ? `${text.slice(0, 139)}…` : text,
      url: "/support",
      telegramText: `💬 Ответ поддержки МЕСТО:\n\n${text}`,
      telegramId: (ticket.telegram_id as number | null) ?? null,
    });
  } else if (ticket.telegram_id) {
    await notifyTelegram(Number(ticket.telegram_id), `💬 Ответ поддержки МЕСТО:\n\n${text}`);
  }
  return delivered ? "delivered" : "saved";
}
