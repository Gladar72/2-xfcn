/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
        ],
      },
    ];
  },
};

module.exports = nextConfig;
