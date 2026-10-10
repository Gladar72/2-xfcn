"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGuide } from "@/lib/mosya/guide";
import type { ChatListItemData } from "@/components/chat/ChatListItem";
import { parseInvite } from "@/lib/chat/invite";
import { photoThumb } from "@/lib/photos/thumb";
import { EmptyIll, Ic, Screen, eventIcon } from "@/components/proto/ui";

type Tab = "ev" | "pm" | "ar";
const isClosed = (c: ChatListItemData) => c.eventStatus === "completed" || c.eventStatus === "cancelled";

/** «Чаты» (SCR.chats прототипа): Встречи · Личные · Архив. */
export default function ChatsPage() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatListItemData[] | null>(null);
  const [tab, setTab] = useState<Tab>("ev");
  useGuide("chats");

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => setChats(data.items ?? []))
      .catch(() => setChats([]));
  }, []);

  const list = useMemo(() => {
    const all = chats ?? [];
    if (tab === "ar") return all.filter(isClosed);
    if (tab === "pm") return all.filter((c) => c.eventTitle === null && !isClosed(c));
    return all.filter((c) => c.eventTitle !== null && !isClosed(c));
  }, [chats, tab]);

  const idx = tab === "ev" ? 0 : tab === "pm" ? 1 : 2;

  return (
    <Screen id="chats" anim="in">
      <div className="bar-top">
        <button className="rb gl" onClick={() => router.back()} aria-label="Назад">
          <Ic n="back" />
        </button>
        <span />
      </div>
      <h1 className="t" style={{ marginTop: 18 }}>
        Чаты
      </h1>
      <div className="seg gl">
        <span className="si" style={{ width: "calc((100% - 8px) / 3)", transform: `translateX(${idx * 100}%)` }} />
        {(
          [
            ["ev", "Встречи"],
            ["pm", "Личные"],
            ["ar", "Архив"],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="clist">
        {chats === null && [0, 1, 2].map((i) => <div key={i} className="sk" style={{ height: 66 }} />)}
        {list.map((c) => {
          const personal = c.eventTitle === null;
          const title = personal ? c.otherUser?.name ?? "Личный чат" : c.eventTitle!;
          const lm = c.lastMessage;
          const content = lm ? (parseInvite(lm.content) ? "📅 Приглашение на встречу" : lm.content) : "Чат создан — напиши первым";
          const preview = lm && !personal ? `${lm.isMine ? "Вы" : (lm.senderName ?? "Участник").split(" ")[0]}: ${content}` : lm?.isMine ? `Вы: ${content}` : content;
          const img = personal ? c.otherUser?.avatarUrl : c.eventPhotoUrl;
          return (
            <Link key={c.conversationId} className="ci gl" href={`/chats/${c.conversationId}`}>
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={personal ? "r" : ""} src={photoThumb(img, 96)} alt="" />
              ) : personal ? (
                <span className="cav r">{title.charAt(0).toUpperCase()}</span>
              ) : (
                <span className="cav gfx">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={eventIcon(c)} alt="" />
                </span>
              )}
              <div className="i">
                <b>{title}</b>
                <span>{preview}</span>
              </div>
              <div className="t">
                {lm ? shortTime(lm.createdAt) : ""}
                {c.unreadCount > 0 && <span className="n">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>}
              </div>
            </Link>
          );
        })}
        {chats !== null && list.length === 0 && (
          <div className="empty">
            <EmptyIll a={["cloud", "mint", "calm"]} b={["ball", "lilac", "calm"]} c={["squ", "pink", "smile"]} />
            <span>
              {tab === "ar"
                ? "Здесь будут чаты завершённых встреч. Писать в них уже нельзя, но история сохранится."
                : tab === "pm"
                  ? "Личные чаты появятся, когда ты напишешь кому-то из профиля — или напишут тебе."
                  : "Когда тебя примут на встречу, её чат появится здесь."}
            </span>
          </div>
        )}
      </div>
    </Screen>
  );
}

function shortTime(isoStr: string) {
  const d = new Date(isoStr);
  const t = new Date();
  const sameDay = d.toDateString() === t.toDateString();
  if (sameDay) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const y = new Date(t);
  y.setDate(t.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
}
