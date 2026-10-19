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
  "/api/telegram/relay/",
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
  // Прокладка к Telegram Bot API для сервера в России: /api/telegram/relay/<путь> → api.telegram.org/<путь>.
  // Пересылаем прямо отсюда (переписывание адреса на Vercel подвешивает POST-запросы с телом).
  // Пропускаем только токен нашего бота — это не открытый прокси.
  if (pathname.startsWith("/api/telegram/relay/")) {
    const rest = pathname.slice("/api/telegram/relay/".length);
    const parts = rest.split("/");
    const isFile = parts[0] === "file";
    const own = process.env.TELEGRAM_BOT_TOKEN;
    if (!own || (isFile ? parts[1] : parts[0]) !== `bot${own}` || parts.length < (isFile ? 3 : 2)) {
      return NextResponse.json({ ok: false, description: "Not Found" }, { status: 404 });
    }
    const headers = new Headers();
    const ct = req.headers.get("content-type");
    if (ct) headers.set("content-type", ct);
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    try {
      const res = await fetch(`https://api.telegram.org/${rest}${req.nextUrl.search}`, {
        method: req.method,
        headers,
        body: hasBody ? await req.arrayBuffer() : undefined,
      });
      return new NextResponse(res.body, {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
      });
    } catch {
      return NextResponse.json({ ok: false, error_code: 502, description: "Relay error" }, { status: 502 });
    }
  }
  // На Vercel (после переезда) всё, кроме прокладки, пересылается на сервер в Yandex Cloud
  // (next.config.js → rewrites): проверки делает сам сервер — его сессии подписаны другим ключом.
  if (process.env.MESTO_PROXY_MODE === "1" && !pathname.startsWith("/tg/")) return NextResponse.next();
  // Сервер в России не видит telegram.org: скрипт Mini App берём у Vercel (адрес прокладки).
  const tgRoot = process.env.TELEGRAM_API_ROOT;
  if (pathname === "/tg/telegram-web-app.js" && tgRoot && !tgRoot.includes("api.telegram.org")) {
    return NextResponse.rewrite(new URL("/tg/telegram-web-app.js", new URL(tgRoot).origin));
  }
  // Файлы для универсальных ссылок (Apple/Google проверяют их своими роботами).
  if (pathname === "/.well-known/assetlinks.json") {
    return NextResponse.rewrite(new URL("/.well-known/assetlinks", req.url));
  }
  if (pathname.startsWith("/.well-known/")) return NextResponse.next();
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
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = req.cookies.get(SESSION_COOKIE)?.value ?? bearer;
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
  matcher: ["/api/telegram/relay/:path*", "/((?!_next/static|_next/image|favicon.ico|brand/|mesto/|marketing/|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf)$).*)"],
};
