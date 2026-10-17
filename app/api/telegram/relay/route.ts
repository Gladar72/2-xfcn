import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Прокладка к Telegram Bot API для сервера в России, откуда api.telegram.org недоступен.
 *   /api/telegram/relay/bot<токен>/<метод>        → https://api.telegram.org/bot<токен>/<метод>
 *   /api/telegram/relay/file/bot<токен>/<путь>    → https://api.telegram.org/file/bot<токен>/<путь>
 * Путь после /relay/ приходит в параметре __p (см. rewrites в next.config.js).
 * Пропускаем только токен нашего бота (TELEGRAM_BOT_TOKEN) — это не открытый прокси:
 * воспользоваться им может лишь тот, у кого и так есть токен бота.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UPSTREAM = "https://api.telegram.org";

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function relay(req: NextRequest) {
  const own = process.env.TELEGRAM_BOT_TOKEN;
  const search = new URLSearchParams(req.nextUrl.search);
  const parts = (search.get("__p") ?? "").split("/").filter(Boolean);
  search.delete("__p");
  const isFile = parts[0] === "file";
  const botPart = isFile ? parts[1] : parts[0];
  const rest = parts.slice(isFile ? 2 : 1);
  if (!own || !botPart?.startsWith("bot") || rest.length === 0 || !sameToken(botPart.slice(3), own)) {
    return NextResponse.json({ ok: false, description: "Not Found" }, { status: 404 });
  }

  const qs = search.toString();
  const url = `${UPSTREAM}/${isFile ? "file/" : ""}${botPart}/${rest.map(encodeURIComponent).join("/")}${qs ? `?${qs}` : ""}`;
  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  try {
    const res = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    return new NextResponse(res.body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error("telegram relay:", (err as Error).message);
    return NextResponse.json({ ok: false, error_code: 502, description: "Relay error" }, { status: 502 });
  }
}

export { relay as GET, relay as POST };
