"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGuide } from "@/lib/mosya/guide";
import type { ChatListItemData } from "@/components/chat/ChatListItem";
import { parseInvite, parseSticker } from "@/lib/chat/invite";
import { photoThumb } from "@/lib/photos/thumb";
import { EmptyIll, Ic, Screen, eventIcon } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";
import { ApiReadError, getJson } from "@/lib/http/get-json";
import { clearChatList, readChatList, rememberChatList } from "@/lib/chat/list-cache";

type Tab = "ev" | "pm" | "ar";
const isClosed = (c: ChatListItemData) => c.eventStatus === "completed" || c.eventStatus === "cancelled";

/** «Чаты» (SCR.chats прототипа): Встречи · Личные · Архив. */
export default function ChatsPage() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatListItemData[] | null>(() => readChatList()?.items ?? null);
  const [tab, setTab] = useState<Tab>(() => readChatList()?.tab ?? "ev");
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useGuide("chats");

  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    getJson<{ items: ChatListItemData[] }>("/api/conversations", controller.signal)
      .then((data) => { if (!controller.signal.aborted) setChats(data.items ?? []); })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiReadError && (err.status === 401 || err.status === 403)) {
          clearChatList();
          setChats(null);
        }
        setError(true);
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => { if (chats) rememberChatList(chats, tab); }, [chats, tab]);

  // Returning from Telegram/background should refresh unread counts without polling every chat.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setAttempt((n) => n + 1); };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
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
        <button className="rb gl" onClick={() => goBack(router, "/feed")} aria-label="Назад">
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
        {error && <div className="empty" role="alert">
          <b>Не удалось загрузить чаты.</b>
          <button className="btn v" onClick={() => setAttempt((n) => n + 1)}>Попробовать снова</button>
        </div>}
        {chats === null && !error && [0, 1, 2].map((i) => <div key={i} className="sk" style={{ height: 66 }} />)}
        {list.map((c) => {
          const personal = c.eventTitle === null;
          const title = personal ? c.otherUser?.name ?? "Личный чат" : c.eventTitle!;
          const lm = c.lastMessage;
          const content = lm ? (parseInvite(lm.content) ? "📅 Приглашение на встречу" : parseSticker(lm.content) ? "Стикер" : lm.content) : "Чат создан — напиши первым";
          const preview = lm && !personal ? `${lm.isMine ? "Вы" : (lm.senderName ?? "Участник").split(" ")[0]}: ${content}` : lm?.isMine ? `Вы: ${content}` : content;
          const img = personal ? c.otherUser?.avatarUrl : c.eventPhotoUrl;
          return (
            <Link key={c.conversationId} className="ci gl" href={`/chats/${c.conversationId}`}
              onClick={() => setOpening(c.conversationId)} aria-busy={opening === c.conversationId}>
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
                <span>{opening === c.conversationId ? "Открываем…" : preview}</span>
              </div>
              <div className="t">
                {lm ? shortTime(lm.createdAt) : ""}
                {c.unreadCount > 0 && <span className="n">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>}
              </div>
            </Link>
          );
        })}
        {chats !== null && !error && list.length === 0 && (
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
