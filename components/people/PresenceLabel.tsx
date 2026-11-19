"use client";

import { useEffect, useState } from "react";
import { profileIsOnline } from "@/lib/people/presence";

export function PresenceLabel({ lastActiveAt }: { lastActiveAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!lastActiveAt) return;
    const update = () => { if (!document.hidden) setNow(Date.now()); };
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [lastActiveAt]);
  const online = profileIsOnline(lastActiveAt, now);
  return <span className="presence"><i aria-hidden="true" data-online={online} />{online ? "Онлайн" : "Не онлайн"}</span>;
}
