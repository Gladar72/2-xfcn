import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notify/user";
import { getBot } from "@/lib/telegram/bot";

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
  const { data: ticket, error: readError } = await admin
    .from("support_tickets")
    .select("id, user_id, telegram_id, admin_reply, admin_telegram_message_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (readError) throw new Error("Could not read support ticket");
  if (!ticket) return "missing";

  const text = reply.trim().slice(0, 2000);
  if (!text) throw new Error("Empty support reply");
  const prev = (ticket.admin_reply as string | null) ?? "";
  const repeated = prev === text || prev.endsWith(`\n\n${text}`);
  if (repeated && ticket.admin_telegram_message_id) return "delivered";
  const { error: saveError } = await admin
    .from("support_tickets")
    .update({
      admin_reply: repeated ? prev : prev ? `${prev}\n\n${text}` : text,
      admin_replied_at: new Date().toISOString(), status: "resolved",
      admin_telegram_message_id: null, admin_telegram_delivered_at: null,
    })
    .eq("id", ticketId);
  if (saveError) throw new Error("Could not save support reply");

  if (ticket.user_id) {
    await notifyUser(admin, ticket.user_id as string, {
      title: "Ответ поддержки МЕСТО",
      body: text.length > 140 ? `${text.slice(0, 139)}…` : text,
      url: "/support",
    }).catch(() => console.error("Support: app notification unavailable"));
  }
  if (!ticket.telegram_id) return "saved";
  try {
    // Always the MESTO bot. Do not infer delivery from the presence of a chat ID.
    const sent = await getBot().api.sendMessage(Number(ticket.telegram_id), `💬 Ответ поддержки МЕСТО:\n\n${text}`);
    const { error } = await admin.from("support_tickets").update({
      admin_telegram_message_id: sent.message_id,
      admin_telegram_delivered_at: new Date().toISOString(),
    }).eq("id", ticketId);
    if (error) console.error("Support: delivery acknowledgment could not be saved");
    return "delivered";
  } catch {
    console.error("Support: Telegram did not confirm delivery");
    if (ticket.user_id) return "saved";
    throw new Error("Telegram support reply was not delivered");
  }
}
