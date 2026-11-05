"use client";

import { useEffect, useMemo } from "react";
import { Overlay } from "@/components/proto/ui";
import { mosyaSrc } from "@/components/brand/Mosya";
import { photoThumb } from "@/lib/photos/thumb";
import { interestIcon } from "@/lib/data/interests";

export interface MatchPerson {
  name: string;
  avatarUrl: string | null;
  gender?: string | null;
}

const HEART = "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z";
const COLORS = ["#FF8FB5", "#FF4F8B", "#FFFFFF", "#C9A8FF", "#FFD1E4", "#A24DFF"];

/** Лёгкая вибрация «успех» в Telegram (или в обычном браузере, если умеет). */
function buzz() {
  try {
    const tg = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { notificationOccurred?: (t: string) => void } } } }).Telegram;
    const h = tg?.WebApp?.HapticFeedback?.notificationOccurred;
    if (h) h("success");
    else navigator.vibrate?.([30, 50, 60]);
  } catch {
    /* вибрация — необязательна */
  }
}

/**
 * «Это взаимно!» — праздничный экран на весь экран: фото влетают с боков,
 * между ними выпрыгивает сердце, сердечки разлетаются и всплывают снизу,
 * выскакивает Мося. Кнопки ведут к встрече и к переписке.
 */
export function MatchCelebration({
  open,
  me,
  other,
  common = [],
  onInvite,
  onMessage,
  onClose,
}: {
  open: boolean;
  me: string | null;
  other: MatchPerson;
  common?: string[];
  onInvite: () => void;
  onMessage: () => void;
  onClose: () => void;
}) {
  // Траектории сердечек — новые на каждое открытие.
  const burst = useMemo(
    () =>
      open
        ? Array.from({ length: 30 }, (_, i) => {
            const a = Math.random() * Math.PI * 2;
            const d = 110 + Math.random() * 180;
            return {
              c: COLORS[i % COLORS.length],
              x: Math.round(Math.cos(a) * d),
              y: Math.round(Math.sin(a) * d - 110 - Math.random() * 110),
              s: +(0.5 + Math.random() * 1.1).toFixed(2),
              r: Math.round((Math.random() - 0.5) * 80),
              delay: +(0.9 + Math.random() * 0.25).toFixed(2),
              dur: +(1.3 + Math.random() * 1.1).toFixed(2),
            };
          })
        : [],
    [open]
  );
  const rise = useMemo(
    () =>
      open
        ? Array.from({ length: 14 }, (_, i) => ({
            c: COLORS[(i + 2) % COLORS.length],
            left: Math.round(4 + Math.random() * 92),
            x: Math.round((Math.random() - 0.5) * 60),
            y: Math.round(520 + Math.random() * 280),
            s: +(0.5 + Math.random() * 0.7).toFixed(2),
            r: Math.round((Math.random() - 0.5) * 60),
            delay: +(1.8 + Math.random() * 1.6).toFixed(2),
            dur: +(2.6 + Math.random() * 1.4).toFixed(2),
          }))
        : [],
    [open]
  );

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(buzz, 950);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  const verb = other.gender === "female" ? "поставила" : other.gender === "male" ? "поставил" : "поставил(а)";

  return (
    <Overlay>
      <div className="mcel" role="dialog" aria-modal="true" aria-label="Это взаимно">
        <div className="mc-bg" />
        <div className="mc-glow" />
        <button className="mc-x" type="button" aria-label="Закрыть" onClick={onClose} />
        <div className="mc-ph a" style={me ? { backgroundImage: `url(${photoThumb(me, 320)})` } : undefined} />
        <div className="mc-ph b" style={other.avatarUrl ? { backgroundImage: `url(${photoThumb(other.avatarUrl, 320)})` } : undefined}>
          {!other.avatarUrl && <span>{other.name.charAt(0).toUpperCase()}</span>}
        </div>
        <div className="mc-hb">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d={HEART} fill="#fff" />
          </svg>
        </div>
        <div className="mc-parts" aria-hidden>
          {burst.map((p, i) => (
            <svg
              key={`b${i}`}
              className="mc-p"
              viewBox="0 0 24 24"
              style={{ "--x": `${p.x}px`, "--y": `${p.y}px`, "--s": p.s, "--r": `${p.r}deg`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` } as React.CSSProperties}
            >
              <path d={HEART} fill={p.c} />
            </svg>
          ))}
          {rise.map((p, i) => (
            <svg
              key={`r${i}`}
              className="mc-p up"
              viewBox="0 0 24 24"
              style={{ left: `${p.left}%`, "--x": `${p.x}px`, "--y": `-${p.y}px`, "--s": p.s, "--r": `${p.r}deg`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` } as React.CSSProperties}
            >
              <path d={HEART} fill={p.c} />
            </svg>
          ))}
        </div>
        <div className="mc-txt">
          <h2>
            Это <em>взаимно!</em>
          </h2>
          <p>{`${other.name} тоже ${verb} тебе сердечко`}</p>
          {common.length > 0 && (
            <div className="mc-chips">
              {common.slice(0, 3).map((c) => (
                <span key={c}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={interestIcon(c)} alt="" />
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="mc-say">Ура! Зови скорее на встречу 💜</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mc-mo" src={mosyaSrc("jump")} alt="" />
        <div className="mc-btns">
          <button type="button" className="mc-btn v" onClick={onInvite}>
            Позвать на встречу
          </button>
          <button type="button" className="mc-btn o" onClick={onMessage}>
            Написать
          </button>
        </div>
      </div>
    </Overlay>
  );
}
