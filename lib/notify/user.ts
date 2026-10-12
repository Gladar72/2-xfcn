import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";
import { sendPushToUsers, type PushMessage } from "@/lib/push/expo";

type Admin = ReturnType<typeof createAdminClient>;

export interface UserNotice {
  /** Заголовок push-уведомления в мобильном приложении. */
  title: string;
  /** Текст push-уведомления. */
  body: string;
  /** Маршрут в приложении, куда ведёт тап: "/event/<id>", "/chat/<id>", "/notifications". */
  url?: string;
  data?: Record<string, unknown>;
  /**
   * Текст для Telegram-бота (как и раньше, через notifyTelegram с кнопкой
   * «Открыть приложение»). Не задан — в Telegram ничего не уходит.
   */
  telegramText?: string;
  /**
   * telegram_id получателя, если уже известен вызывающему коду. Если не
   * передан (undefined), а telegramText есть — берём из users.
   */
  telegramId?: number | null;
}

/**
 * Единая точка уведомления пользователя: push в мобильное приложение +
 * (пока Mini App жив) прежнее сообщение от Telegram-бота.
 * Никогда не бросает исключений.
 */
export async function notifyUser(admin: Admin, userId: string | null | undefined, notice: UserNotice): Promise<void> {
  if (!userId) return;
  const push: PushMessage = {
    title: notice.title,
    body: notice.body,
    data: { ...(notice.data ?? {}), ...(notice.url ? { url: notice.url } : {}) },
  };

  const tasks: Promise<unknown>[] = [sendPushToUsers(admin, [userId], push)];

  if (notice.telegramText) {
    tasks.push(
      (async () => {
        let telegramId = notice.telegramId;
        if (telegramId === undefined) {
          const { data } = await admin.from("users").select("telegram_id").eq("id", userId).maybeSingle();
          telegramId = (data?.telegram_id as number | null | undefined) ?? null;
        }
        if (telegramId) await notifyTelegram(Number(telegramId), notice.telegramText!);
      })().catch((err) => console.error("notifyUser: telegram", err))
    );
  }

  await Promise.allSettled(tasks);
}

/** Короткое название встречи для заголовка push (без огромных строк). */
export function shortTitle(title: string | null | undefined, max = 60): string {
  const t = (title ?? "").trim() || "встреча";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
