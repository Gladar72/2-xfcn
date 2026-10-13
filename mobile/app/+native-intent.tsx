/**
 * Универсальные ссылки: телефон открывает приложение по адресам mesto-go.ru/…
 * (список — lib/applinks.ts на сервере и android.intentFilters в app.json).
 * Здесь переводим адреса сайта в экраны приложения. Ссылки mesto://… не трогаем.
 */
const SITE_HOSTS = new Set(["mesto-go.ru", "www.mesto-go.ru"]);
const ID = "([0-9a-fA-F-]{36})";

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [new RegExp(`^/(?:e|events)/${ID}/?$`), (m) => `/event/${m[1]}`],
  [new RegExp(`^/events/${ID}/applications/?$`), (m) => `/applications/${m[1]}`],
  [new RegExp(`^/events/${ID}/ticket/?$`), (m) => `/ticket/${m[1]}`],
  [new RegExp(`^/events/${ID}/tickets/?$`), (m) => `/tickets/${m[1]}`],
  [new RegExp(`^/people/${ID}/?$`), (m) => `/person/${m[1]}`],
  [new RegExp(`^/chats/${ID}/?$`), (m) => `/chat/${m[1]}`],
  [/^\/city\/([^/?#]+)\/?$/, (m) => `/city/${m[1]}`],
  [/^\/r\/([a-zA-Z0-9]{4,32})\/?$/, (m) => `/r/${m[1].toLowerCase()}`],
  [/^\/(people|chats|my-events|notifications)\/?$/, (m) => `/${m[1]}`],
];

function mapSitePath(pathname: string): string | null {
  for (const [re, to] of RULES) {
    const m = pathname.match(re);
    if (m) return to(m);
  }
  return null;
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (/^https?:\/\//i.test(path)) {
      const url = new URL(path);
      if (!SITE_HOSTS.has(url.hostname.toLowerCase())) return path;
      return mapSitePath(url.pathname) ?? "/";
    }
    // Иногда система отдаёт только путь сайта (/events/…): у приложения таких экранов нет — переводим.
    const pathname = path.split(/[?#]/)[0] ?? path;
    return mapSitePath(pathname) ?? path;
  } catch {
    return "/";
  }
}
