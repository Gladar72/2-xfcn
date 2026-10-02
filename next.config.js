/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Исходники (source maps) в браузер не отдаём — только сжатый код.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // grammy использует Node.js-специфичные механизмы — не бандлим его,
  // а используем как обычную серверную зависимость (актуально для Next.js 14;
  // в более новых версиях ключ называется serverExternalPackages — свериться
  // при апгрейде Next.js).
  experimental: {
    serverComponentsExternalPackages: ["grammy"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "t.me",
      },
    ],
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
