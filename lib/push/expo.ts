import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Push-уведомления в мобильное приложение через Expo Push API.
 *
 * Токены регистрирует само приложение (mobile/lib/push.ts →
 * POST /api/me/push-token) в таблицу push_tokens. Здесь — только отправка.
 *
 * Никогда не бросает исключений: push — дополнительный канал, и его сбой
 * не должен ронять основной запрос (отклик, сообщение, оплату и т.д.).
 */

type Admin = ReturnType<typeof createAdminClient>;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
const FETCH_TIMEOUT_MS = 5000;
/** Лимит Expo на одно сообщение — 4 КБ; кириллица = 2 байта на символ. */
const MAX_BODY_CHARS = 500;

export interface PushMessage {
  title: string;
  body: string;
  /** url — маршрут внутри приложения: "/event/<id>", "/chat/<id>", "/notifications". */
  data?: { url?: string; [key: string]: unknown };
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: "default";
  channelId: "default";
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

function getAdmin(admin?: Admin | null): Admin | null {
  if (admin) return admin;
  try {
    return createAdminClient();
  } catch (err) {
    console.error("push: нет доступа к БД", err);
    return null;
  }
}

/**
 * POST в Expo с таймаутом: push вызывается в т.ч. из обработчиков запросов
 * (await) — зависший Expo не должен держать ответ и функцию Vercel.
 */
async function postBatch(
  headers: Record<string, string>,
  batch: ExpoMessage[]
): Promise<{ res: Response; json: { data?: ExpoTicket[]; errors?: unknown } | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(batch),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[]; errors?: unknown } | null;
    return { res, json };
  } finally {
    clearTimeout(timer);
  }
}

/** Отправляет готовые сообщения пачками по 100 и удаляет «мёртвые» токены. */
async function sendExpoMessages(admin: Admin, messages: ExpoMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  const deadTokens: string[] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const { res, json } = await postBatch(headers, batch);
      if (!res.ok) {
        console.error("push: Expo вернул ошибку", res.status, json?.errors ?? json);
        continue;
      }
      const tickets: ExpoTicket[] = Array.isArray(json?.data) ? (json?.data as ExpoTicket[]) : [];
      tickets.forEach((ticket, idx) => {
        if (ticket?.status !== "error") return;
        if (ticket.details?.error === "DeviceNotRegistered") {
          const token = batch[idx]?.to;
          if (token) deadTokens.push(token);
        } else {
          console.error("push: ошибка доставки", ticket.details?.error, ticket.message);
        }
      });
    } catch (err) {
      console.error("push: не удалось отправить пачку", err);
    }
  }

  if (deadTokens.length > 0) {
    try {
      await admin.from("push_tokens").delete().in("token", deadTokens);
    } catch (err) {
      console.error("push: не удалось удалить токены", err);
    }
  }
}

async function loadTokens(admin: Admin, userIds: string[]): Promise<{ token: string; user_id: string }[]> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return [];
  const rows: { token: string; user_id: string }[] = [];
  // .in() с тысячами id может упереться в длину URL — режем на куски.
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin
      .from("push_tokens")
      .select("token, user_id")
      .in("user_id", ids.slice(i, i + 200));
    if (error) {
      console.error("push: не удалось загрузить токены", error);
      continue;
    }
    rows.push(...((data ?? []) as { token: string; user_id: string }[]));
  }
  return rows;
}

function toExpo(token: string, message: PushMessage): ExpoMessage {
  return {
    to: token,
    title: message.title,
    body: message.body.length > MAX_BODY_CHARS ? `${message.body.slice(0, MAX_BODY_CHARS - 1)}…` : message.body,
    data: message.data ?? {},
    sound: "default",
    channelId: "default",
  };
}

/** Одно и то же уведомление нескольким пользователям (на всех их устройства). */
export async function sendPushToUsers(
  admin: Admin | null | undefined,
  userIds: string[],
  message: PushMessage
): Promise<void> {
  try {
    const db = getAdmin(admin);
    if (!db) return;
    const tokens = await loadTokens(db, userIds);
    await sendExpoMessages(db, tokens.map((t) => toExpo(t.token, message)));
  } catch (err) {
    console.error("push: sendPushToUsers упал", err);
  }
}

/** Персональные уведомления: у каждого пользователя свой текст. */
export async function sendPushPersonal(
  admin: Admin | null | undefined,
  items: { userId: string; message: PushMessage }[]
): Promise<void> {
  try {
    const db = getAdmin(admin);
    if (!db || items.length === 0) return;
    const tokens = await loadTokens(
      db,
      items.map((i) => i.userId)
    );
    const byUser = new Map<string, PushMessage[]>();
    for (const item of items) {
      const list = byUser.get(item.userId) ?? [];
      list.push(item.message);
      byUser.set(item.userId, list);
    }
    const messages: ExpoMessage[] = [];
    for (const t of tokens) {
      for (const msg of byUser.get(t.user_id) ?? []) messages.push(toExpo(t.token, msg));
    }
    await sendExpoMessages(db, messages);
  } catch (err) {
    console.error("push: sendPushPersonal упал", err);
  }
}
