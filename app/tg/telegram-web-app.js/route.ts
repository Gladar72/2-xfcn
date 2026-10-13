/**
 * Официальный скрипт Telegram Mini Apps, отдаваемый с нашего домена.
 *
 * Раньше app/layout.tsx грузил его напрямую с https://telegram.org. У части
 * российских провайдеров telegram.org из WebView не открывается или зависает,
 * а скрипт подключён как beforeInteractive — страница не доходит до ready(),
 * и пользователь видит белый экран. Здесь сервер Vercel сам забирает скрипт
 * у Telegram и кэширует его на сутки, а WebView качает его с нашего домена.
 */
const UPSTREAM = "https://telegram.org/js/telegram-web-app.js";

export const revalidate = 86400;

export async function GET() {
  try {
    const res = await fetch(UPSTREAM, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const body = await res.text();
    return new Response(body, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    // Не валим загрузку страницы: пустой скрипт, initData возьмём из адреса
    // (см. getInitData в lib/telegram/webapp-client.ts).
    return new Response("/* telegram-web-app.js недоступен */", {
      status: 200,
      headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
