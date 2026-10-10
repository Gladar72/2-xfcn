import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
// mesto.css раньше globals.css: классы-компоненты m-*, а утилиты Tailwind
// (идут позже) могут их точечно переопределять — как слой components.
import "./mesto.css";
import "./globals.css";
import "./proto.css";
import "./proto-app.css";
import { TelegramInit } from "@/components/telegram/TelegramInit";

// Golos Text — шрифт интерфейса редизайна 2026 (локальный вариативный файл,
// без Google Fonts CDN, с кириллицей). Onest оставлен запасным.
const golos = localFont({
  src: "../public/brand/fonts/GolosText-Variable.ttf",
  variable: "--font-golos",
  display: "swap",
  weight: "400 900",
});
const onest = localFont({
  src: "../public/brand/fonts/Onest-Variable.ttf",
  variable: "--font-onest",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Место",
  description: "Есть куда пойти. Найдём, с кем.",
  icons: { icon: "/brand/logo/favicon-m.svg", apple: "/brand/logo/app-icon.png" },
};

export const viewport = { themeColor: "#F6F2FF" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${golos.variable} ${onest.variable}`}>
      <head>
        {/* Официальный скрипт Telegram Mini Apps — инжектит window.Telegram.WebApp */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="text-ink-900 antialiased font-sans">
        {/* Неподвижный фон-«аврора» редизайна 2026: мягкие пятна фиолетового,
            розового, неба и персика на молочном. Отдельный fixed-слой с
            z-index:-1 — не тормозит при скролле в WebView Telegram. */}
        <div className="m-aurora fixed inset-0 -z-10" aria-hidden />
        <TelegramInit />
        {children}
      </body>
    </html>
  );
}
