"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/Logo";
import { Character } from "@/components/brand/AliveStage";
import type { Face, Palette, Shape } from "@/components/brand/characters";

/**
 * Заставка загрузки: три сцены с персонажами-эмодзи «Места» сменяются
 * каждые 3,2 с, пока грузится приложение (по мотивам онбординга Abode,
 * но в нашем стиле). Внизу — облака, заголовок, подпись и полоса загрузки.
 */
type Ch = [Shape, Palette, Face, number, number, number, number, string?]; // форма, цвет, лицо, x%, y%, размер, задержка, анимация входа

const SCENES: { title: [string, string]; text: string; cast: Ch[] }[] = [
  {
    title: ["Есть куда", "пойти"],
    text: "Кофе, кино, пробежка, концерт — смотри, что происходит в городе прямо сейчас.",
    cast: [
      ["flower", "sky", "smile", 50, 50, 150, 0],
      ["squ", "pink", "calm", 22, 22, 78, 0.25],
      ["star", "peach", "sly", 80, 24, 72, 0.4],
      ["cloud", "mint", "smile", 18, 78, 74, 0.55],
      ["clover", "violet", "wow", 82, 76, 80, 0.7],
    ],
  },
  {
    title: ["Найдём,", "с кем"],
    text: "Люди рядом идут туда же. Откликнись — и ты уже не один.",
    cast: [
      ["blob", "pink", "wow", 30, 58, 128, 0, "fromL"],
      ["ball", "lilac", "calm", 70, 58, 120, 0.1, "fromR"],
    ],
  },
  {
    title: ["Встречаемся", "в Месте"],
    text: "Выбери место и иди проводить время вместе.",
    cast: [
      ["flower", "peach", "calm", 18, 62, 84, 0.45],
      ["squ", "pink", "smile", 82, 62, 80, 0.6],
      ["cloud", "sky", "smile", 30, 86, 70, 0.75],
      ["star", "violet", "sly", 70, 86, 68, 0.9],
    ],
  },
];

const HEART = "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z";
const SPARK = ["#FF5FAE", "#FFB27A", "#5AA9FF", "#3CCB9A", "#7A4BFF"];

export function LoadingScenes({ message, loading = true }: { message?: string; loading?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % SCENES.length), 3200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="ls" role="status" aria-label="Загрузка">
      <style>{CSS}</style>
      <span className="ls-wm">
        <Wordmark height={24} color="#6C3BFF" />
      </span>
      <div className="ls-dots">
        {SCENES.map((_, k) => (
          <i key={k} className={k === i ? "on" : ""} />
        ))}
      </div>
      <div className="ls-stage">
        {SCENES.map((s, k) => (
          <div key={k} className={`ls-scene ${k === i ? "on" : ""}`}>
            {k === 2 && (
              <svg className="ls-prop ls-pin" style={{ ["--x" as string]: "50%", ["--y" as string]: "46%", ["--a" as string]: "ls-drop" }} viewBox="0 0 64 84">
                <defs>
                  <radialGradient id="lsPin" cx=".35" cy=".3" r=".8">
                    <stop offset="0" stopColor="#B9A2FF" />
                    <stop offset="1" stopColor="#6C3BFF" />
                  </radialGradient>
                </defs>
                <ellipse cx="32" cy="80" rx="14" ry="4" fill="rgba(108,59,255,.15)" />
                <path d="M32 2C16 2 4 14 4 30c0 20 28 48 28 48s28-28 28-48C60 14 48 2 32 2z" fill="url(#lsPin)" />
                <circle cx="32" cy="30" r="11" fill="#fff" />
              </svg>
            )}
            {s.cast.map(([shape, pal, face, x, y, size, d, a], n) => {
              const v = { ["--x" as string]: `${x}%`, ["--y" as string]: `${y}%`, ["--s" as string]: `${size}px`, ["--d" as string]: `${d}s`, ...(a ? { ["--a" as string]: `ls-${a}` } : {}) };
              return (
                <span key={n}>
                  <span className="ls-shadow" style={v} />
                  <span className="ls-ch" style={v}>
                    <span className="ls-wrap">
                      <Character shape={shape} pal={pal} face={face} size={size} seed={k * 10 + n + 1} />
                    </span>
                  </span>
                </span>
              );
            })}
            {k === 1 && (
              <>
                <svg className="ls-prop ls-heart" style={{ ["--x" as string]: "50%", ["--y" as string]: "24%", ["--d" as string]: ".7s" }} viewBox="0 0 24 24">
                  <path fill="#FF5FAE" d={HEART} />
                </svg>
                <svg className="ls-prop ls-heart" style={{ ["--x" as string]: "62%", ["--y" as string]: "12%", ["--d" as string]: "1s", width: 20 }} viewBox="0 0 24 24">
                  <path fill="#FFB27A" d={HEART} />
                </svg>
              </>
            )}
            {k === 2 &&
              Array.from({ length: 10 }, (_, n) => {
                const ang = (n / 10) * Math.PI * 2;
                return (
                  <i
                    key={n}
                    className="ls-prop ls-spark"
                    style={{
                      ["--x" as string]: "50%",
                      ["--y" as string]: "34%",
                      ["--d" as string]: ".35s",
                      ["--tx" as string]: `${Math.round(Math.cos(ang) * 90)}px`,
                      ["--ty" as string]: `${Math.round(Math.sin(ang) * 70)}px`,
                      background: SPARK[n % 5],
                    }}
                  />
                );
              })}
          </div>
        ))}
      </div>
      <div className="ls-clouds" aria-hidden>
        <span style={{ left: "-2%", width: "34%", height: "70%" }} />
        <span style={{ left: "22%", width: "30%", height: "95%" }} />
        <span style={{ left: "46%", width: "36%", height: "75%" }} />
        <span style={{ left: "74%", width: "34%", height: "100%" }} />
      </div>
      <div className="ls-txt">
        {message ? (
          <div className="ls-t on">
            <p>{message}</p>
          </div>
        ) : (
          SCENES.map((s, k) => (
            <div key={k} className={`ls-t ${k === i ? "on" : ""}`}>
              <h1>
                {s.title[0]}
                <br />
                <em>{s.title[1]}</em>
              </h1>
              <p>{s.text}</p>
            </div>
          ))
        )}
      </div>
      {loading && (
        <div className="ls-load">
          <b />
        </div>
      )}
    </div>
  );
}

const CSS = `
.ls{position:fixed;inset:0;background:#FBFAFF;overflow:hidden;z-index:50;color:#16121F;font-family:var(--font-onest),var(--font-golos),system-ui,sans-serif}
.ls-wm{position:absolute;top:calc(env(safe-area-inset-top) + 7%);left:50%;transform:translateX(-50%);z-index:3;display:block;line-height:0}
.ls-dots{position:absolute;top:calc(env(safe-area-inset-top) + 7% + 36px);left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:3}
.ls-dots i{width:6px;height:6px;border-radius:9px;background:#D9D2F2;transition:all .4s}
.ls-dots i.on{width:18px;background:#6C3BFF}
.ls-stage{position:absolute;left:0;right:0;top:15%;height:44%;max-width:460px;margin:0 auto}
.ls-scene{position:absolute;inset:0;opacity:0;transition:opacity .35s}
.ls-scene.on{opacity:1}
.ls-ch{position:absolute;width:var(--s);height:var(--s);left:var(--x);top:var(--y);margin:calc(var(--s)/-2) 0 0 calc(var(--s)/-2)}
.ls-wrap{display:block;width:100%;height:100%;opacity:0}
.ls-wrap>*{width:100%!important;height:100%!important}
.on .ls-wrap{animation:var(--a,ls-pop) .7s cubic-bezier(.34,1.56,.64,1) both,ls-hop 1.6s ease-in-out infinite;animation-delay:var(--d,0s),calc(var(--d,0s) + .8s)}
@keyframes ls-pop{0%{opacity:0;transform:scale(.2) translateY(30px)}100%{opacity:1;transform:none}}
@keyframes ls-fromL{0%{opacity:0;transform:translateX(-160px) rotate(-12deg)}100%{opacity:1;transform:none}}
@keyframes ls-fromR{0%{opacity:0;transform:translateX(160px) rotate(12deg)}100%{opacity:1;transform:none}}
@keyframes ls-drop{0%{opacity:0;transform:translateY(-220px)}70%{opacity:1;transform:translateY(8px)}100%{opacity:1;transform:none}}
@keyframes ls-hop{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
.ls-shadow{position:absolute;left:var(--x);top:calc(var(--y) + var(--s)/2 - 4px);width:calc(var(--s)*.6);height:8px;margin-left:calc(var(--s)*-.3);border-radius:50%;background:rgba(108,59,255,.10);opacity:0}
.on .ls-shadow{animation:ls-fade .6s both;animation-delay:var(--d,0s)}
@keyframes ls-fade{to{opacity:1}}
.ls-prop{position:absolute;left:var(--x);top:var(--y);opacity:0}
.on .ls-prop{animation:var(--a,ls-pop) .6s cubic-bezier(.34,1.56,.64,1) both;animation-delay:var(--d,0s)}
.ls-heart{width:34px;margin:-17px 0 0 -17px}
.on .ls-heart{animation:ls-pop .5s cubic-bezier(.34,1.56,.64,1) both,ls-beat 1s ease-in-out infinite;animation-delay:var(--d),calc(var(--d) + .5s)}
@keyframes ls-beat{50%{transform:scale(1.18)}}
.ls-pin{width:70px;margin:-60px 0 0 -35px}
.ls-spark{width:10px;height:10px;border-radius:10px;margin:-5px 0 0 -5px}
.on .ls-spark{animation:ls-burst 1.1s ease-out both;animation-delay:var(--d)}
@keyframes ls-burst{0%{opacity:0;transform:translate(0,0) scale(.4)}20%{opacity:1}100%{opacity:0;transform:translate(var(--tx),var(--ty)) scale(1)}}
.ls-clouds{position:absolute;left:-10%;right:-10%;top:55%;height:14%;z-index:1}
.ls-clouds span{position:absolute;bottom:0;border-radius:50%;background:#EFEBFA}
.ls-txt{position:absolute;left:0;right:0;top:63%;bottom:0;background:#EFEBFA;z-index:2;text-align:center}
.ls-t{position:absolute;left:28px;right:28px;top:6%;max-width:400px;margin:0 auto;opacity:0;transform:translateY(10px);transition:opacity .45s,transform .45s}
.ls-t.on{opacity:1;transform:none}
.ls-t h1{font-weight:800;font-size:32px;line-height:1.04;letter-spacing:-.02em;margin:0 0 12px;color:#16121F}
.ls-t h1 em{font-style:normal;color:#6C3BFF}
.ls-t p{margin:0;color:#3D3752;font-size:15px;line-height:1.45}
.ls-load{position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom) + 6%);transform:translateX(-50%);width:120px;height:4px;border-radius:9px;background:#DCD5F3;overflow:hidden;z-index:3}
.ls-load b{position:absolute;inset:0;width:40%;border-radius:9px;background:linear-gradient(90deg,#6C3BFF,#FF6FA0);animation:ls-ld 1.4s ease-in-out infinite}
@keyframes ls-ld{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
@media (prefers-reduced-motion: reduce){.ls *{animation:none!important}.ls-wrap,.ls-prop,.ls-shadow{opacity:1!important}}
`;
