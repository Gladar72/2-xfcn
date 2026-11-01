"use client";

import { useEffect, useState } from "react";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";

/** New visit, new selection. GPS updates and ordinary focus events keep it stable. */
export function usePeopleVisitSeed(): string {
  const [seed, setSeed] = useState(() => crypto.randomUUID());
  useEffect(() => {
    const app = getTelegramWebApp();
    let inactive = document.visibilityState === "hidden" || app?.isActive === false;
    const pause = () => { inactive = true; };
    const resume = () => {
      if (!inactive || document.visibilityState === "hidden" || app?.isActive === false) return;
      inactive = false;
      setSeed(crypto.randomUUID());
    };
    const visibility = () => { if (document.visibilityState === "hidden") pause(); else resume(); };
    const pageshow = (event: PageTransitionEvent) => { if (event.persisted) { pause(); resume(); } };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", pageshow);
    app?.onEvent("deactivated", pause);
    app?.onEvent("activated", resume);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", pageshow);
      app?.offEvent("deactivated", pause);
      app?.offEvent("activated", resume);
    };
  }, []);
  return seed;
}
