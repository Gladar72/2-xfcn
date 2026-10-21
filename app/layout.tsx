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
import { ScreenTransitions } from "@/components/proto/ScreenTransitions";

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
  // Запасной шрифт — не грузим заранее (≈100 КБ, мешали первому запуску на медленной сети).
  preload: false,
});

/**
 * Белый экран при первом открытии в Telegram: Telegram держит свою белую
 * заглушку, пока приложение не скажет «готово» (web_app_ready). Раньше это
 * происходило только после загрузки всего JS — на медленной сети/холодном
 * старте это секунды белого экрана, повторное открытие (уже из кэша) — быстрое.
 * Теперь сообщаем Telegram «готово» сразу, как только нарисована заставка
 * (инлайн-скрипт в конце body выполняется после загрузки CSS), без
 * ожидания telegram-web-app.js и бандла.
 */
const EARLY_READY = `(function(){function p(t){try{var w=window,d='{}';if(w.TelegramWebviewProxy&&w.TelegramWebviewProxy.postEvent){w.TelegramWebviewProxy.postEvent(t,d);return}if(w.external&&'notify' in w.external){w.external.notify(JSON.stringify({eventType:t,eventData:{}}));return}if(w.parent&&w.parent!==w){w.parent.postMessage(JSON.stringify({eventType:t,eventData:{}}),'*')}}catch(e){}}p('web_app_ready');p('web_app_expand')})();`;

/**
 * После обновления сайта у кого-то в кэше может остаться старая страница со
 * ссылками на уже несуществующие куски JS — приложение не оживает и висит.
 * Если кусок /_next/static не загрузился — один раз перезагружаем страницу.
 */
const CHUNK_RELOAD = `window.addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='SCRIPT'&&/\\/_next\\/static\\//.test(t.src||'')){try{if(!sessionStorage.getItem('mesto_chunk_reload')){sessionStorage.setItem('mesto_chunk_reload','1');location.reload()}}catch(_){}}},true);`;

export const metadata: Metadata = {
  title: "Место",
  description: "Есть куда пойти. Найдём, с кем.",
  icons: { icon: "/brand/logo/favicon-m.svg", apple: "/brand/logo/app-icon.png" },
};

// maximumScale: 1 — iPhone не приближает экран при нажатии на поле ввода (из-за этого экран «ехал» вбок).
export const viewport = { themeColor: "#F6F2FF", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover" as const };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${golos.variable} ${onest.variable}`}>
      <head>
        {/* Официальный скрипт Telegram Mini Apps — инжектит window.Telegram.WebApp.
            Отдаём с нашего домена (app/tg/telegram-web-app.js): telegram.org
            у части российских провайдеров не грузится → белый экран. */}
        <Script src="/tg/telegram-web-app.js" strategy="beforeInteractive" />
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RELOAD }} />
      </head>
      <body className="text-ink-900 antialiased font-sans">
        {/* Неподвижный фон-«аврора» редизайна 2026: мягкие пятна фиолетового,
            розового, неба и персика на молочном. Отдельный fixed-слой с
            z-index:-1 — не тормозит при скролле в WebView Telegram. */}
        <div className="m-aurora fixed inset-0 -z-10" aria-hidden />
        <TelegramInit />
        <ScreenTransitions />
        {children}
        <script dangerouslySetInnerHTML={{ __html: EARLY_READY }} />
      </body>
    </html>
  );
}
