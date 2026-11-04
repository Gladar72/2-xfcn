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
      <a href={TELEGRAM_BOT_URL} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48, borderRadius: 999, padding: "0 18px", marginTop: state === "ready" ? 12 : 0, background: "rgba(108,59,255,.10)", color: "#6C3BFF", fontWeight: 600, textDecoration: "none" }}>Открыть «Место» в Telegram</a>
    </div>
  );
}
