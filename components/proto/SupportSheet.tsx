"use client";

import { useEffect, useRef, useState } from "react";
import { mosyaSrc } from "@/components/brand/Mosya";
import { Ic, Sheet } from "./ui";

const QUICK = ["Как создать встречу?", "Почему заявку не приняли?", "Как работает анонимность?", "Как оплатить подписку?", "Позвать живого человека"];

interface Msg {
  me?: boolean;
  t: string;
}

/** «Мося на связи» (supportSheet прототипа): ИИ отвечает сразу, копия уходит команде. */
export function SupportChat() {
  const [msgs, setMsgs] = useState<Msg[]>([{ t: "Привет! Я помогу разобраться с приложением. Спроси что угодно или выбери вопрос 👇" }]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: 1e5, behavior: "smooth" });
  }, [msgs, typing]);

  async function ask(q: string) {
    const message = q.trim();
    if (!message || typing) return;
    setText("");
    setMsgs((m) => [...m, { me: true, t: message }]);
    setTyping(true);
    try {
      const res = await fetch("/api/support/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const d = await res.json().catch(() => ({}));
      setMsgs((m) => [...m, { t: d.reply ?? "Не получилось ответить — попробуй ещё раз или напиши в бота @Mesto_people_bot." }]);
    } catch {
      setMsgs((m) => [...m, { t: "Проблема с соединением. Попробуй ещё раз." }]);
    } finally {
      setTyping(false);
    }
  }

  return (
    <>
      <div className="sup">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mosyaSrc("glasses")} alt="" />
        <div>
          <b>Мося на связи</b>
          <span>Помощник «Места» · отвечает сразу</span>
        </div>
      </div>
      <div className="msgs2" ref={box}>
        {msgs.map((m, i) => (
          <div key={i} className={`m ${m.me ? "me" : ""} new`}>
            <div className="bb" style={{ whiteSpace: "pre-wrap" }}>
              {m.t}
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
