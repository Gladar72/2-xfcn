"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Creature } from "@/components/brand/Creature";
import { KI, bg } from "@/components/proto/k";
import { watchVisible } from "@/lib/http/watch-visible";
import { heartPage, type IncomingHeart } from "@/lib/people/heart-inbox";

export function IncomingHeartsLink() {
  const [latest, setLatest] = useState<IncomingHeart>();
  useEffect(() => watchVisible(async signal => {
    try {
      const page = await heartPage(signal);
      if (!signal.aborted) setLatest(page.items[0]);
    } catch { /* Keep the last successful preview. */ }
  }), []);
  return <Link className="k-row k-g k-pr" href="/hearts" style={{ marginTop: 14, borderRadius: 22 }}>
    <span style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, position: "relative", ...(latest?.avatarUrl ? bg(latest.avatarUrl, 92) : {}) }}>
      {!latest?.avatarUrl && <Creature size={44}/>}
      <span aria-hidden style={{ position: "absolute", right: -2, bottom: -2, borderRadius: "50%", background: "#ff4f8b", color: "#fff", padding: "0 4px", border: "2px solid white" }}>♥</span>
    </span>
    <span style={{ flex: 1 }}><b>Входящие сердечки</b><small style={{ display: "block" }}>
      {latest ? `${latest.name} · Смотреть всех` : "Кто поставил тебе сердечко"}
    </small></span><KI n="chev" />
  </Link>;
}
