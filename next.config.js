/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
