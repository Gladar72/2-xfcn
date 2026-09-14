import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";

// Onest — подлинный вариативный файл шрифта из пакета ассетов (не Google Fonts CDN):
// полностью локально, без внешних сетевых запросов, с поддержкой кириллицы.
const onest = localFont({
  src: "../public/brand/fonts/Onest-Variable.ttf",
  variable: "--font-onest",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "МЕСТО",
  description: "Когда есть куда пойти, но не с кем.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={onest.variable}>
      <head>
        {/* Официальный скрипт Telegram Mini Apps — инжектит window.Telegram.WebApp */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="bg-background text-ink-900 antialiased font-sans">{children}</body>
    </html>
  );
}
