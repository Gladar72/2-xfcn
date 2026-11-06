"use client";

import { useEffect, useState } from "react";
import { Creature } from "@/components/brand/Creature";

/**
 * Заставка при открытии (брендбук 2026, экран intro прототипа): жемчужный
 * фон, логотип, живой Мося и три сменяющихся текста с полосками сверху.
 */
const SLIDES: { small: string; title: [string, string, string]; text: string }[] = [
  {
    small: "Добро пожаловать в Место",
    title: ["Есть куда пойти.", "Найдём, ", "с кем"],
    text: "Встречи с людьми рядом: кофе, спорт, кино, прогулки. Нажми «Я иду» — организатор примет заявку.",
  },
  {
    small: "Встречи рядом",
    title: ["Люди рядом", "идут туда же — ", "присоединяйся"],
    text: "Личные встречи, спортивные события и афиша заведений твоего города.",
  },
  {
    small: "Своя встреча",
    title: ["Не нашёл?", "Создай ", "свою"],
    text: "Пара минут — и люди с похожими интересами увидят твою встречу.",
  },
];

const CSS = `
.ls{position:fixed;inset:0;z-index:50;overflow:hidden;background:#F4F2F8;color:#17141F;font-family:var(--font-inter),"Inter",system-ui,sans-serif}
.ls .ls-bg{position:absolute;inset:-30%;pointer-events:none;background:radial-gradient(30% 20% at 80% 20%,rgba(170,160,255,.5),transparent 70%),radial-gradient(28% 20% at 15% 65%,rgba(255,190,160,.42),transparent 70%),radial-gradient(35% 22% at 70% 92%,rgba(140,170,255,.38),transparent 70%),linear-gradient(180deg,#F5F3F8,#ECE8F2);animation:ls-drift 18s ease-in-out infinite alternate}
@keyframes ls-drift{50%{transform:translate(-3%,2%) rotate(6deg)}100%{transform:translate(2%,-3%) rotate(-4deg)}}
.ls .ls-top{position:absolute;left:26px;right:24px;top:calc(max(env(safe-area-inset-top,0px),var(--tg-safe-area-inset-top,0px)) + var(--tg-content-safe-area-inset-top,0px) + 18px);display:flex;align-items:center;justify-content:space-between}
.ls .ls-top img{height:28px;width:auto}
.ls .ls-bars{display:flex;gap:5px}
.ls .ls-bars i{width:26px;height:4px;border-radius:2px;background:rgba(23,20,31,.12);overflow:hidden;display:block}
.ls .ls-bars i b{display:block;height:100%;width:0;background:#17141F;border-radius:2px}
.ls .ls-bars i.done b{width:100%}
.ls .ls-bars i.run b{animation:ls-run 3.2s linear forwards}
@keyframes ls-run{to{width:100%}}
.ls .ls-cr{position:absolute;left:50%;top:22%;transform:translateX(-50%)}
.ls .ls-txt{position:absolute;left:26px;right:26px;bottom:calc(max(env(safe-area-inset-bottom,0px),var(--tg-safe-area-inset-bottom,0px)) + 56px);animation:ls-in .6s cubic-bezier(.32,.72,0,1) both}
@keyframes ls-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.ls .ls-txt small{font:300 15px var(--font-inter),"Inter",sans-serif;color:rgba(23,20,31,.58)}
.ls .ls-txt h1{font:300 38px/1.14 var(--font-inter),"Inter",sans-serif;letter-spacing:-.035em;margin:10px 0 0;text-wrap:balance}
.ls .ls-txt h1 b{font-weight:600}
.ls .ls-txt h1 em{font-family:var(--font-lora),"Lora",Georgia,serif;font-style:italic;font-weight:400;font-size:1.08em;line-height:1}
.ls .ls-txt p{font:400 15px/1.5 var(--font-inter),"Inter",sans-serif;color:rgba(23,20,31,.58);margin:12px 0 0;max-width:34ch}
.ls .ls-msg{margin-top:14px;font:500 14px/1.4 var(--font-inter),"Inter",sans-serif;color:#17141F}
@media (prefers-reduced-motion: reduce){.ls .ls-bg,.ls .ls-txt,.ls .ls-bars i.run b{animation:none}.ls .ls-bars i.run b{width:100%}}
`;

export function LoadingScenes({ message, loading = true }: { message?: string; loading?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 3200);
    return () => clearInterval(t);
  }, [loading]);
  const s = SLIDES[i]!;

  return (
    <div className="ls" role="status" aria-label="Загрузка">
      <style>{CSS}</style>
      <div className="ls-bg" aria-hidden />
      <div className="ls-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/auth/wordmark-dark.svg" alt="место" />
        <span className="ls-bars" aria-hidden>
          {SLIDES.map((_, k) => (
            <i key={`${k}-${i}`} className={k < i ? "done" : k === i ? "run" : ""}>
              <b />
            </i>
          ))}
        </span>
      </div>
      <div className="ls-cr">
        <Creature size={240} variant="e" />
      </div>
      <div className="ls-txt" key={i}>
        <small>{s.small}</small>
        <h1>
          {s.title[0]}
          <br />
          <b>
            {s.title[1]}
            <em>{s.title[2]}</em>
          </b>
        </h1>
        <p>{s.text}</p>
        {message && <p className="ls-msg">{message}</p>}
      </div>
    </div>
  );
}
