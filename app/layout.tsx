import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";
import { TelegramInit } from "@/components/telegram/TelegramInit";

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
      <body className="text-ink-900 antialiased font-sans">
        {/* Неподвижный слой фона на весь экран — не задаём фон прямо на
            body/html: тогда background-size:cover растягивался бы на всю
            прокручиваемую высоту страницы (искажая картинку на длинных
            списках), а background-attachment:fixed известно тормозит при
            скролле в мобильном Safari/WebKit (тот же движок у Telegram
            WebView). Отдельный fixed-слой с z-index:-1 — стандартный
            обход обеих проблем. */}
        <div
          className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url(/brand/backgrounds/gradient-bg.jpg)" }}
        />
        <TelegramInit />
        {children}
      </body>
    </html>
  );
}
