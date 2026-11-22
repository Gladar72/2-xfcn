"use client";

import { useEffect, useRef, useState } from "react";
import { watchVisible } from "@/lib/http/watch-visible";
import { getJson } from "@/lib/http/get-json";
import { mosyaSrc } from "@/components/brand/Mosya";
import { Ic, Sheet } from "./ui";

const QUICK = ["Как создать встречу?", "Почему заявку не приняли?", "Как работает анонимность?", "Как оплатить подписку?", "Как стать партнёром?"];

interface Msg {
  me?: boolean;
  team?: boolean;
  t: string;
}

/** «Мося на связи» (supportSheet прототипа): ИИ отвечает сразу, копия уходит команде. */
export function SupportChat() {
  const [msgs, setMsgs] = useState<Msg[]>([{ t: "Привет! Я помогу разобраться с приложением. Спроси что угодно или выбери вопрос 👇" }]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const revision = useRef(0);
  const busy = useRef(false);
  useEffect(() => watchVisible(async signal => {
    if (busy.current) return;
    const at = revision.current;
    try {
      const { items } = await getJson<{ items: { message: string; botReply?: string; adminReply?: string }[] }>("/api/support/history", signal);
      if (signal.aborted || busy.current || revision.current !== at || !Array.isArray(items)) return;
      setMsgs(prev => [prev[0]!, ...items.flatMap(ticket => {
        const messages: Msg[] = [{ me: true, t: ticket.message }];
        if (ticket.botReply) messages.push({ t: ticket.botReply });
        if (ticket.adminReply) messages.push({ team: true, t: ticket.adminReply });
        return messages;
      })]);
    } catch { /* A refresh must not discard messages already visible. */ }
  }), []);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: 1e5, behavior: "smooth" });
  }, [msgs, typing]);

  async function ask(q: string, human = false) {
    const message = q.trim();
    if (!message || busy.current) return;
    busy.current = true;
    revision.current++;
    setText("");
    setMsgs((m) => [...m, { me: true, t: message }]);
    setTyping(true);
    try {
      const res = await fetch("/api/support/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, human }) });
      const d = await res.json().catch(() => ({}));
      setMsgs((m) => [...m, { t: d.reply ?? "Не получилось ответить — попробуй ещё раз или напиши в бота @Mesto_people_bot." }]);
    } catch {
      setMsgs((m) => [...m, { t: "Проблема с соединением. Попробуй ещё раз." }]);
    } finally {
      setTyping(false);
      busy.current = false;
    }
  }

  return (
    <>
      <div className="sup">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mosyaSrc("glasses")} alt="" />
        <div>
          <b>Помощь</b>
          <span>Мося отвечает сразу, команда — в течение дня</span>
        </div>
      </div>
      <div className="msgs2" ref={box}>
        {msgs.map((m, i) => (
          <div key={i} className={`m ${m.me ? "me" : ""} new`}>
            <div className="bb" style={{ whiteSpace: "pre-wrap" }}>
              {m.team && <b>Команда МЕСТО<br /></b>}{m.t}
            </div>
          </div>
        ))}
        {typing && (
          <div className="typing">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      {msgs.length === 1 && (
        <div className="quick" style={{ flexWrap: "wrap" }}>
          {QUICK.map((q) => (
            <button key={q} onClick={() => ask(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
      <button className="chip gl" disabled={typing} onClick={() => ask("Позвать человека", true)}>Позвать человека</button>
      <form
        className="inrow"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <label className="field gl">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Напиши вопрос" />
        </label>
        <button className="send" type="submit" aria-label="Отправить" disabled={!text.trim() || typing}>
          <Ic n="send" />
        </button>
      </form>
    </>
  );
}

export function SupportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} cls="supx">
      {open && <SupportChat />}
    </Sheet>
  );
}
