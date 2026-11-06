"use client";

import { useEffect, useRef, useState } from "react";
import { isTelegramWidgetReady } from "@/lib/telegram/widget-ready";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "Mesto_people_bot";
export const TELEGRAM_BOT_URL = `https://t.me/${BOT_USERNAME}`;
type AuthData = Record<string, string | number>;

/** Telegram errors (e.g. an unlinked domain) are plain iframe documents, not a ready widget. */
export function TelegramLoginWidget({ onAuth }: { onAuth: (user: AuthData) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const callback = useRef(onAuth);
  callback.current = onAuth;
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    const host = box.current;
    if (!host) return;
    const authWindow = window as unknown as { onMestoTelegramAuth?: (user: AuthData) => void };
    const handleAuth = (user: AuthData) => callback.current(user);
    authWindow.onMestoTelegramAuth = handleAuth;
    const timer = setTimeout(() => setState("unavailable"), 5000);
    const onMessage = (event: MessageEvent) => {
      if (isTelegramWidgetReady(event, host.querySelector("iframe")?.contentWindow ?? null)) {
        clearTimeout(timer);
        setState("ready");
      }
    };
    window.addEventListener("message", onMessage);
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", BOT_USERNAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "14");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onMestoTelegramAuth(user)");
    script.onerror = () => { clearTimeout(timer); setState("unavailable"); };
    host.appendChild(script);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      script.onerror = null;
      host.replaceChildren();
      if (authWindow.onMestoTelegramAuth === handleAuth) delete authWindow.onMestoTelegramAuth;
    };
  }, []);

  return (
    <div style={{ textAlign: "center", width: "100%" }}>
      <div ref={box} aria-hidden={state !== "ready"} style={{ display: "flex", justifyContent: "center", visibility: state === "ready" ? "visible" : "hidden", height: state === "ready" ? "auto" : 0, overflow: "hidden" }} />
      {state === "unavailable" && <p role="status" style={{ fontSize: 13, lineHeight: 1.4, color: "#8A84A0", margin: "0 0 12px" }}>Вход через Telegram в этом браузере сейчас недоступен. Можно открыть «Место» прямо в Telegram.</p>}
      <a href={TELEGRAM_BOT_URL} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 27, padding: "0 18px", marginTop: state === "ready" ? 10 : 0, background: "rgba(255,255,255,.94)", color: "#17141F", fontWeight: 500, fontSize: 16, minHeight: 54, textDecoration: "none" }}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="#2AABEE" aria-hidden><path d="M21.5 4.2 2.9 11.4c-1.3.5-1.2 1.3-.2 1.6l4.8 1.5 1.8 5.6c.2.7.4.9.9.9.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.3zM9.6 14.2l-.4 4.1-1.5-4.8 10.6-6.7z" /></svg>
        {state === "ready" ? "Открыть «Место» в Telegram" : "Войти через Telegram"}
      </a>
    </div>
  );
}
