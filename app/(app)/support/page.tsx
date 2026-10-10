"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/brand/Icon";
import { Mosya } from "@/components/brand/Mosya";
import { useGuide } from "@/lib/mosya/guide";

const QUICK = [
  "Как создать встречу?",
  "Почему заявку не приняли?",
  "Как работает анонимность?",
  "Как оплатить подписку?",
  "Позвать живого человека",
];

interface Msg {
  from: "me" | "mosya";
  text: string;
}

/** Мося-помощник: вопросы о сервисе, ИИ отвечает сразу; копия уходит команде. */
export default function SupportPage() {
  const router = useRouter();
  useGuide("support");
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "mosya", text: "Привет! Я помогу разобраться с приложением. Спроси что угодно или выбери вопрос 👇" },
  ]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs, typing]);

  async function ask(q: string) {
    const message = q.trim();
    if (!message || typing) return;
    setText("");
    setMsgs((m) => [...m, { from: "me", text: message }]);
    setTyping(true);
    try {
      const res = await fetch("/api/support/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const d = await res.json().catch(() => ({}));
      setMsgs((m) => [...m, { from: "mosya", text: d.reply ?? "Не получилось ответить — попробуй ещё раз или напиши в бота." }]);
    } catch {
      setMsgs((m) => [...m, { from: "mosya", text: "Проблема с соединением. Попробуй ещё раз." }]);
    } finally {
      setTyping(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col px-5 pt-4">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Назад" className="m-glass m-press grid h-11 w-11 shrink-0 place-items-center rounded-full">
          <Icon name="back" size={22} />
        </button>
        <Mosya pose="glasses" size={48} />
        <div>
          <b className="block text-[17px] font-medium">Мося на связи</b>
          <span className="text-xs text-ink-400">Помощник «Места» · отвечает сразу</span>
        </div>
      </div>

      <div className="flex-1 space-y-2">
        {msgs.map((m, i) => (
          <div key={i} className={`m-fade-in flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[80%] whitespace-pre-wrap px-4 py-2.5 text-[14.5px] leading-snug ${
                m.from === "me"
                  ? "rounded-[22px_22px_6px_22px] bg-brand-gradient text-white"
                  : "rounded-[22px_22px_22px_6px] bg-white/85 shadow-card backdrop-blur-xl"
              }`}
            >
              {m.text}
            </p>
          </div>
        ))}
        {typing && (
          <div className="flex gap-1 px-2 py-3">
            {[0, 1, 2].map((i) => (
              <span key={i} className="splash-dot h-2 w-2 rounded-full bg-accent" style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </div>
        )}
        {msgs.length === 1 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {QUICK.map((q) => (
              <button key={q} onClick={() => ask(q)} className="m-glass m-press rounded-pill px-3.5 py-2 text-[13px] font-medium text-accent">
                {q}
              </button>
            ))}
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
        className="sticky bottom-24 mt-3 flex gap-2 pb-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Напиши вопрос"
          className="m-glass min-w-0 flex-1 rounded-pill border-0 px-4 py-3 text-base outline-none focus:shadow-[inset_0_0_0_2px_#9B5CFF]"
        />
        <button type="submit" aria-label="Отправить" className="m-press grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-gradient text-white shadow-cta">
          <Icon name="send" size={20} />
        </button>
      </form>
    </div>
  );
}
