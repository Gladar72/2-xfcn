"use client";

import { useEffect, useState } from "react";
import { presenceLabel } from "@/lib/people/presence";

export function PresenceLabel({ lastActiveAt, gender }: { lastActiveAt?: string | null; gender?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!lastActiveAt) return;
    const update = () => { if (!document.hidden) setNow(Date.now()); };
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [lastActiveAt]);
  const label = presenceLabel(lastActiveAt, gender, now);
  return label ? <span className="presence" title="Последняя активность в Месте">{label === "В сети" && <i aria-hidden />}{label}</span> : null;
}
