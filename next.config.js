/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Сборка для своего сервера (Yandex Cloud, deploy/yandex): самодостаточный server.js.
  // На Vercel переменная не задана — там сборка как раньше.
  output: process.env.STANDALONE === "1" ? "standalone" : undefined,
  // Исходники (source maps) в браузер не отдаём — только сжатый код.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // grammy использует Node.js-специфичные механизмы — не бандлим его,
  // а используем как обычную серверную зависимость (актуально для Next.js 14;
  // в более новых версиях ключ называется serverExternalPackages — свериться
  // при апгрейде Next.js).
  experimental: {
    serverComponentsExternalPackages: ["grammy"],
    // Шрифты, Мося и jpg-обложки для картинки-сторис (app/api/events/[id]/story.png).
    outputFileTracingIncludes: {
      "/api/events/[id]/story.png": ["./assets/og/**", "./public/brand/covers-jpg/**"],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      // Своё хранилище фото после переезда в Россию (Supabase на сервере Yandex Cloud).
      {
        protocol: "https",
        hostname: "db.mesto-go.ru",
      },
      {
        protocol: "https",
        hostname: "t.me",
      },
    ],
  },
  // После переезда на сервер в Yandex Cloud: всё, что ещё приходит на Vercel (старые
  // версии мобильного приложения с адресом 2-xfcn.vercel.app, старые кнопки в боте),
  // пересылаем на сервер — иначе люди попадают в старую базу, и их встречи никто не видит.
  // На Vercel остаётся только прокладка к Telegram (/api/telegram/relay, /tg/...).
  async rewrites() {
    if (!process.env.VERCEL) return [];
    return {
      beforeFiles: [
        { source: "/", destination: "https://new.mesto-go.ru/" },
        {
          source: "/:path((?!api/telegram/relay/|tg/).*)",
          destination: "https://new.mesto-go.ru/:path",
        },
      ],
    };
  },
  env: {
    MESTO_PROXY_MODE: process.env.VERCEL ? "1" : "",
  },
  // Разрешаем встраивание в Telegram WebView (Mini App открывается в iframe/webview Telegram)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://web.telegram.org https://telegram.org;",
          },
          // Просим поисковики и ИИ-сервисы не индексировать и не использовать контент.
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, noimageindex, noai, noimageai" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
