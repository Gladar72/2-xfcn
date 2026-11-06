"use client";

import { KI } from "@/components/proto/k";
import { Creature } from "@/components/brand/Creature";
import { useEffect } from "react";
import { Overlay } from "@/components/proto/ui";
import { photoThumb } from "@/lib/photos/thumb";
import { interestIcon } from "@/lib/data/interests";

export interface MatchPerson {
  name: string;
  avatarUrl: string | null;
  gender?: string | null;
}


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
      {/* Экран «Это взаимно!» как в прототипе: два фото, Мося посередине, общие интересы. */}
      <div className="K" role="dialog" aria-modal="true" aria-label="Это взаимно" style={{ position: "fixed", inset: 0, zIndex: 520 }}>
        <div className="k-match">
          <button className="k-rb k-g k-pr k-x" type="button" aria-label="Закрыть" onClick={onClose} style={{ top: "calc(var(--top) - 6px)" }}>
            <KI n="x" />
          </button>
          <div className="k-ph k-a" style={me ? { backgroundImage: `url(${photoThumb(me, 520)})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "#ECE8F2" }} />
          <div
            className="k-ph k-b"
            style={other.avatarUrl ? { backgroundImage: `url(${photoThumb(other.avatarUrl, 520)})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "#ECE8F2", display: "grid", placeItems: "center", font: "300 48px var(--disp)" }}
          >
            {!other.avatarUrl && other.name.charAt(0).toUpperCase()}
          </div>
          <div className="k-mid">
            <Creature size={170} variant="e" />
          </div>
          <div className="k-t">
            <h1>
              Это <em>взаимно!</em>
            </h1>
            <p>{`${other.name} тоже ${verb} тебе сердечко`}</p>
            {common.length > 0 && (
              <div className="k-cs">
                {common.slice(0, 3).map((c) => (
                  <span key={c} className="k-chip k-g">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={interestIcon(c)} alt="" style={{ width: 22, height: 22, marginLeft: -4 }} />
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="k-bt" style={{ bottom: "calc(var(--bot) + 24px)" }}>
            <button type="button" className="k-btn k-d k-pr" onClick={onInvite}>
              Позвать на встречу
            </button>
            <button type="button" className="k-btn k-l k-pr" onClick={onMessage}>
              Написать
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
