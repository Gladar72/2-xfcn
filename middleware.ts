import { NextRequest, NextResponse } from "next/server";

/**
 * Защита от копирования и выкачивания данных:
 *   1. ИИ-краулеры и скраперы (по User-Agent) получают 403 на любые адреса.
 *   2. API с данными (встречи, люди, чаты, геокодер) — только для вошедших:
 *      проверяем подпись сессии (JWT, HS256, тот же секрет, что выдаёт /api/auth).
 *   3. Ограничение частоты запросов к API — не даёт за минуту пролистать всю базу.
 *
 * Сами обработчики по-прежнему проверяют пользователя (getCurrentUser) —
 * это дополнительный внешний слой, а не замена.
 */

// ИИ-краулеры и известные скраперы. Превью ссылок Telegram (TelegramBot) не трогаем.
const BLOCKED_AGENTS =
  /GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|Claude-User|anthropic-ai|PerplexityBot|Perplexity-User|CCBot|Bytespider|Amazonbot|Applebot-Extended|Google-Extended|GoogleOther|meta-externalagent|FacebookBot|Diffbot|cohere-ai|cohere-training|YouBot|Timpibot|ImagesiftBot|Omgili|DataForSeoBot|PetalBot|SemrushBot|AhrefsBot|MJ12bot|DotBot|Scrapy|python-requests|aiohttp|httpx|Go-http-client|node-fetch|axios|curl\/|Wget|HeadlessChrome|PhantomJS|Puppeteer|Playwright/i;

// API, которые доступны без входа: вход/регистрация, вебхуки, кроны (у них свои секреты),
// справочники для анкеты.
const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/telegram/",
  "/api/payments/",
  "/api/webhooks/",
  "/api/subscriptions/yookassa",
  "/api/cron/",
  "/api/n8n/",
  "/api/interests",
  "/api/categories",
];

// Вебхуки и кроны не ограничиваем по частоте и не проверяем по User-Agent
// (Telegram, ЮKassa, Vercel Cron, n8n ходят своими клиентами).
const SERVICE_PREFIXES = [
  "/api/telegram/webhook",
  "/api/payments/",
  "/api/webhooks/",
  "/api/subscriptions/yookassa",
  "/api/cron/",
  "/api/n8n/",
];

const SESSION_COOKIE = "meetup_session";
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 150; // запросов к API в минуту с одного пользователя/IP — с запасом для обычной работы

const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Проверка JWT (HS256) сессии — та же подпись, что у jsonwebtoken в lib/telegram/session.ts. */
async function verifySession(token: string | undefined): Promise<string | null> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts as [string, string, string];
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(h))) as { alg?: string };
    if (header.alg !== "HS256") return null;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const ok = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(p))) as { sub?: string; exp?: number };
    if (typeof payload.sub !== "string") return null;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isService = SERVICE_PREFIXES.some((p) => pathname.startsWith(p));
  const ua = req.headers.get("user-agent") ?? "";

  // 1. ИИ-краулеры и скраперы.
  if (!isService && BLOCKED_AGENTS.test(ua)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!pathname.startsWith("/api/") || isService) return NextResponse.next();

  // 2. Вход обязателен для API с данными. Регистрация (POST /api/users) — без сессии.
  const isPublic =
    PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p)) || (pathname === "/api/users" && req.method === "POST");
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  // Если секрет почему-то недоступен в этой среде — не ломаем приложение:
  // требуем хотя бы наличие cookie, а полную проверку делают сами обработчики.
  const userId = process.env.SUPABASE_JWT_SECRET ? await verifySession(token) : token ? "cookie" : null;
  if (!isPublic && !userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 3. Частота запросов.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown";
  if (rateLimited(userId ? `u:${userId}` : `ip:${ip}`)) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  return NextResponse.next();
}

export const config = {
  // Всё, кроме статики Next.js и картинок/шрифтов из public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|mesto/|marketing/|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf)$).*)"],
};
