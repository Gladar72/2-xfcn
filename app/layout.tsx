import type { Metadata } from "next";
import Script from "next/script";
import { Onest } from "next/font/google";
import "./globals.css";

// Onest — основной фирменный шрифт МЕСТО (см. MESTO_FINAL_assets/README_FINAL.md).
// Подключаем штатным способом через next/font — без коммита файлов шрифта.
// Кириллица обязательна: весь интерфейс на русском.
const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-onest",
  display: "swap",
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
