import type { Api } from "grammy";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Учёт блокировок бота: что бот прислал человеку последним и когда тот его заблокировал.
 * Нужен, чтобы понять, после каких сообщений люди блокируют бота (Telegram сам не говорит).
 */
const SEND_METHODS = new Set(["sendMessage", "sendPhoto", "sendVideo", "sendDocument", "sendAnimation", "sendMediaGroup"]);

function previewOf(method: string, payload: Record<string, unknown>): string {
  const t = (payload.text ?? payload.caption ?? "") as string;
  const clean = String(t).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return (clean || method).slice(0, 80);
}

/** Подключить к API бота: после каждой успешной отправки в личный чат — запомнить, что ушло. */
export function trackBotSends(api: Api) {
  api.config.use(async (prev, method, payload, signal) => {
    const res = await prev(method, payload, signal);
    if (!SEND_METHODS.has(method)) return res;
    const p = payload as unknown as Record<string, unknown>;
    const chat = Number(p.chat_id);
    if (!Number.isFinite(chat) || chat <= 0) return res; // только личные чаты
    try {
      const admin = createAdminClient();
      if (res.ok) {
        void admin
          .from("bot_last_messages")
          .upsert({ telegram_id: chat, method, preview: previewOf(method, p), sent_at: new Date().toISOString() })
          .then(() => {}, () => {});
      } else if (res.error_code === 403 && /blocked/i.test(res.description ?? "")) {
        void recordBlock(chat, "blocked", true);
      }
    } catch {
      /* учёт не должен мешать отправке */
    }
    return res;
  });
}

/**
 * Записать блокировку/разблокировку. fromSendError — блокировку заметили по ошибке отправки
 * (тогда пишем, только если ещё не записана последней).
 */
export async function recordBlock(telegramId: number, status: "blocked" | "unblocked", fromSendError = false) {
  try {
    const admin = createAdminClient();
    if (fromSendError) {
      const { data: lastRow } = await admin
        .from("bot_blocks")
        .select("status")
        .eq("telegram_id", telegramId)
        .order("at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastRow?.status === "blocked") return;
    }
    const [{ data: last }, { data: user }] = await Promise.all([
      admin.from("bot_last_messages").select("method, preview, sent_at").eq("telegram_id", telegramId).maybeSingle(),
      admin.from("users").select("id, created_at").eq("telegram_id", telegramId).maybeSingle(),
    ]);
    await admin.from("bot_blocks").insert({
      telegram_id: telegramId,
      user_id: (user?.id as string | undefined) ?? null,
      status,
      last_method: (last?.method as string | undefined) ?? null,
      last_preview: (last?.preview as string | undefined) ?? null,
      last_sent_at: (last?.sent_at as string | undefined) ?? null,
      user_created_at: (user?.created_at as string | undefined) ?? null,
    });
  } catch (err) {
    console.error("bot-blocks: record failed", err);
  }
}
