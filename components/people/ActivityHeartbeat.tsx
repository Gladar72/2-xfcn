"use client";

import { useEffect } from "react";

/** The web/Telegram app uses the same presence endpoint as the native app. */
export function ActivityHeartbeat() {
  useEffect(() => {
    let request: AbortController | null = null;
    let last = 0;
    const ping = () => {
      if (document.hidden || request || Date.now() - last < 30_000) return;
      last = Date.now();
      request = new AbortController();
      void fetch("/api/me/ping", { method: "POST", signal: request.signal })
        .catch(() => {}).finally(() => { request = null; });
    };
    ping();
    const timer = window.setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", ping); request?.abort(); };
  }, []);
  return null;
}
