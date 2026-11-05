"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MatchCelebration, type MatchPerson } from "@/components/people/MatchCelebration";

type Note = { id: string; type: string; isRead: boolean; linkUserId: string | null };
type Match = { noteId: string; userId: string; other: MatchPerson; common: string[]; me: string | null };

const SHOWN_KEY = "mesto_match_shown";

/**
 * Взаимность случилась, пока человека не было в приложении, — при входе один раз
 * показываем праздничный экран «Это взаимно!» и отмечаем уведомление прочитанным.
 */
export function MatchOnOpen() {
  const router = useRouter();
  const pathname = usePathname();
  const [match, setMatch] = useState<Match | null>(null);

  useEffect(() => {
    let alive = true;
    let shown: string[] = [];
    try {
      shown = JSON.parse(sessionStorage.getItem(SHOWN_KEY) ?? "[]");
    } catch {
      shown = [];
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { items?: Note[] };
        const n = (d.items ?? []).find((x) => x.type === "heart_mutual" && !x.isRead && x.linkUserId && !shown.includes(x.id));
        if (!n || !n.linkUserId) return;
        const [u, me] = await Promise.all([
          fetch(`/api/users/${n.linkUserId}`).then((r) => (r.ok ? r.json() : null)),
          fetch("/api/me/profile").then((r) => (r.ok ? r.json() : null)),
        ]);
        if (!alive || !u || u.error) return;
        const photos: string[] = Array.isArray(u.photos) ? u.photos : [];
        setMatch({
          noteId: n.id,
          userId: n.linkUserId,
          other: { name: u.name, avatarUrl: photos[0] ?? u.avatarUrl ?? null, gender: u.gender ?? null },
          common: Array.isArray(u.commonInterests) ? u.commonInterests : [],
          me: me?.avatarUrl ?? null,
        });
        try {
          sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...shown, n.id]));
        } catch {
          /* не страшно */
        }
        fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [n.id] }) }).catch(() => {});
      } catch {
        /* без сети — покажем в следующий раз */
      }
    }, 1200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  // На экране этого же человека праздник уже не нужен.
  if (!match || pathname === `/people/${match.userId}`) return null;
  const go = (act: "invite" | "chat") => {
    const id = match.userId;
    setMatch(null);
    router.push(`/people/${id}?act=${act}`);
  };
  return (
    <MatchCelebration
      open
      me={match.me}
      other={match.other}
      common={match.common}
      onClose={() => setMatch(null)}
      onInvite={() => go("invite")}
      onMessage={() => go("chat")}
    />
  );
}
