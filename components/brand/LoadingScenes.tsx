"use client";

/**
 * Заставка при открытии — как экран входа через Telegram (согласовано 06.11):
 * фото компании, белый логотип по центру, «Найди компанию на сегодня»
 * и тонкая полоска загрузки внизу вместо кнопок.
 */
const CSS = `
.ls .ls-bar{position:absolute;left:50%;bottom:calc(max(env(safe-area-inset-bottom,0px),var(--tg-safe-area-inset-bottom,0px)) + 64px);width:120px;height:3px;margin-left:-60px;border-radius:2px;background:rgba(255,255,255,.25);overflow:hidden}
.ls .ls-bar i{position:absolute;top:0;bottom:0;width:40%;border-radius:2px;background:#fff;animation:ls-run 1.2s ease-in-out infinite}
@keyframes ls-run{0%{left:-40%}100%{left:100%}}
.ls .ls-msg{position:absolute;left:24px;right:24px;bottom:calc(max(env(safe-area-inset-bottom,0px),var(--tg-safe-area-inset-bottom,0px)) + 84px);text-align:center;font:400 14px/1.4 var(--disp);color:rgba(255,255,255,.85)}
@media (prefers-reduced-motion: reduce){.ls .ls-bar i{animation:none;left:30%}}
`;

export function LoadingScenes({ message }: { message?: string; loading?: boolean }) {
  return (
    <main className="K ls" role="status" aria-label="Загрузка" style={{ position: "fixed", inset: 0, zIndex: 50, overflow: "hidden", background: "#17141F", color: "#fff", fontFamily: "var(--disp)" }}>
      <style>{CSS}</style>
      <div className="k-abg" aria-hidden style={{ backgroundImage: "url(/brand/auth/auth_bg.webp)" }} />
      <div className="k-ashade" aria-hidden />
      <div className="k-alogo" style={{ top: "34%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/auth/wordmark-white.svg" alt="место" />
        <p>
          Найди <em>компанию</em>
          <br />
          на сегодня
        </p>
      </div>
      {message && <p className="ls-msg">{message}</p>}
      <span className="ls-bar" aria-hidden>
        <i />
      </span>
    </main>
  );
}
