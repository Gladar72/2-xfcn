/**
 * Push-уведомления на Android через RuStore (VK Push) — работает в России без VPN и Google.
 *
 * Токены регистрирует приложение (mobile/lib/push.ts → POST /api/me/push-token
 * с platform: "rustore"). Отправка — https://www.rustore.ru/help/sdk/push-notifications/send-push-notifications
 *
 * Env: RUSTORE_PUSH_PROJECT_ID и RUSTORE_PUSH_SERVICE_TOKEN
 * (RuStore Консоль → приложение → Push-уведомления → Проекты). Без них — молча ничего не шлём.
 */

const FETCH_TIMEOUT_MS = 5000;
/** Лимит RuStore — 4096 байт на сообщение; кириллица = 2 байта на символ. */
const MAX_BODY_CHARS = 500;
const PARALLEL = 10;

export interface RuStorePush {
  token: string;
  title: string;
  body: string;
  /** Маршрут внутри приложения: "/event/<id>", "/chat/<id>", "/notifications". */
  url?: string;
  data?: Record<string, unknown>;
}

export function ruStoreConfigured(): boolean {
  return Boolean(process.env.RUSTORE_PUSH_PROJECT_ID && process.env.RUSTORE_PUSH_SERVICE_TOKEN);
}

/** Отправляет сообщения; возвращает «мёртвые» токены (удалённые/просроченные), их надо стереть из БД. */
export async function sendRuStore(messages: RuStorePush[]): Promise<string[]> {
  const project = process.env.RUSTORE_PUSH_PROJECT_ID;
  const service = process.env.RUSTORE_PUSH_SERVICE_TOKEN;
  if (!project || !service || messages.length === 0) return [];
  const url = `https://vkpns.rustore.ru/v1/projects/${encodeURIComponent(project)}/messages:send`;
  const dead: string[] = [];

  async function one(m: RuStorePush) {
    // data в RuStore — только строки.
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(m.data ?? {})) if (v != null) data[k] = typeof v === "string" ? v : JSON.stringify(v);
    if (m.url) data.url = m.url;
    const body = m.body.length > MAX_BODY_CHARS ? `${m.body.slice(0, MAX_BODY_CHARS - 1)}…` : m.body;
    const payload = {
      message: {
        token: m.token,
        data,
        notification: { title: m.title, body },
        android: {
          notification: {
            title: m.title,
            body,
            color: "#6C3BFF",
            channel_id: "default",
            // Тап открывает нужный экран приложения по ссылке mesto://… (expo-router).
            ...(m.url ? { click_action: `mesto:/${m.url}`, click_action_type: 1 } : {}),
          },
        },
      },
    };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${service}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.ok) return;
      const err = (await res.json().catch(() => null)) as { error?: { status?: string; message?: string } } | null;
      if (err?.error?.status === "NOT_FOUND") dead.push(m.token);
      else console.error("push: RuStore вернул ошибку", res.status, err?.error?.status, err?.error?.message);
    } catch (e) {
      console.error("push: RuStore недоступен", e);
    }
  }

  for (let i = 0; i < messages.length; i += PARALLEL) {
    await Promise.all(messages.slice(i, i + PARALLEL).map(one));
  }
  return dead;
}
