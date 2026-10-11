"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mosyaSrc } from "@/components/brand/Mosya";
import { interestIcon } from "@/lib/data/interests";
import { Cover, Ic, Sheet, Toast, dayLong, eventIcon } from "@/components/proto/ui";
import { useGuide } from "@/lib/mosya/guide";
import { peek, say } from "@/lib/mosya/peek";
import { goBack } from "@/lib/nav/back";
import { distanceLabel } from "@/lib/geo/approx-distance";
import { suggestMeet } from "@/lib/mosya/suggest";

export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  photos?: string[];
  age: number;
  bio: string | null;
  ratingAvg: number;
  completedMeetingsCount: number;
  interests: string[];
  commonInterests?: string[];
  /** Можно ли написать лично: только после общей встречи. */
  canMessage?: boolean;
  /** Примерное расстояние, целые км (0 — меньше километра). */
  distanceKm?: number | null;
}
interface MyEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  role: "organizer" | "participant";
  category: { slug: string } | null;
  photoUrl: string | null;
}

/** Режим колоды «Люди рядом»: свайп вбок — следующий/предыдущий человек. */
export interface DeckCtl {
  onSwipe: (dir: 1 | -1) => void;
  hasPrev: boolean;
  /** С какой стороны карточка въезжает (направление последнего свайпа). */
  from: 1 | -1 | 0;
}

/**
 * Профиль человека (как в прототипе и как в Tinder): фото на весь экран —
 * тап по левой/правой половине листает фото, свайп вверх открывает «о себе»,
 * в колоде свайп вбок — следующий человек. Внизу «Позвать на встречу»
 * (приглашение на свою встречу в личный чат + Telegram) и «Написать».
 */
export function PersonView({ id, initial, deck }: { id: string; initial?: Person | null; deck?: DeckCtl }) {
  const router = useRouter();
  const [person, setPerson] = useState<Person | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [myEvents, setMyEvents] = useState<MyEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [gi, setGi] = useState(0);
  const swipe = useRef<{ x: number; y: number; top: boolean; axis: "x" | "y" | null } | null>(null);
  const card = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  useGuide(deck ? "deck" : "person", { when: person !== null, force: !!deck });

  useEffect(() => {
    if (initial) return;
    fetch(`/api/users/${id}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError("Профиль не найден.") : setPerson(d)))
      .catch(() => setError("Проблема с соединением."));
  }, [id, initial]);

  /** Карточка улетает в сторону, потом колода показывает следующего. */
  function fly(dir: 1 | -1) {
    const el = card.current;
    if (!deck) return;
    if (dir === -1 && !deck.hasPrev) return snap();
    if (el) {
      el.style.transition = "transform .28s cubic-bezier(.3,.7,.4,1), opacity .28s";
      el.style.transform = `translateX(${dir * -120}%) rotate(${dir * -14}deg)`;
      el.style.opacity = "0";
    }
    setTimeout(() => deck.onSwipe(dir), 240);
  }
  function snap() {
    const el = card.current;
    if (!el) return;
    el.style.transition = "transform .3s cubic-bezier(.2,.9,.3,1.2)";
    el.style.transform = "";
  }

  async function openDirect(eventId?: string) {
    if (!person || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/conversations/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: person.id, eventId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.conversationId) {
        say(
          d.error === "event_unavailable"
            ? "Эта встреча уже закрыта — выбери другую"
            : d.error === "no_shared_event"
              ? NO_MEET_TEXT
              : "Не получилось — попробуй ещё раз"
        );
        return;
      }
      if (eventId) {
        setInviteOpen(false);
        setPick(null);
        peek({ pose: "jump", text: `Позвал! ${person.name} получит приглашение в Telegram`, quick: true, low: true });
      } else router.push(`/chats/${d.conversationId}`);
    } finally {
      setBusy(false);
    }
  }

  function openInvite() {
    setInviteOpen(true);
    // Мося подсказывает, куда позвать, — по интересам человека.
    if (person) {
      const sg = suggestMeet(person.interests, person.commonInterests ?? []);
      if (sg) setTimeout(() => peek({ pose: "glasses", text: sg.text, ms: 6500 }), 450);
    }
    if (myEvents === null)
      fetch("/api/me/events?scope=upcoming")
        .then((r) => r.json())
        .then((d) => {
          const list = (d.items ?? []) as MyEvent[];
          setMyEvents(list);
          setPick(list[0]?.id ?? null);
        })
        .catch(() => setMyEvents([]));
  }

  async function report(reason: string) {
    if (!person) return;
    setMoreOpen(false);
    await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: person.id, reason }),
    }).catch(() => {});
    setToast(reason === "block" ? "Заблокировали — больше не увидите друг друга" : "Спасибо, мы проверим");
    setTimeout(() => setToast(null), 2600);
  }

  if (error || !person)
    return (
      <section className="scr pr aurora fade" data-id="person">
        <div className="gal">
          <div className="sk" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
        </div>
        <div className="hb">
          <button className="rb glass" onClick={() => goBack(router, "/feed")} aria-label="Назад">
            <Ic n="back" />
          </button>
          {deck && error ? (
            <button className="rb glass" onClick={() => deck.onSwipe(1)} aria-label="Следующий">
              <Ic n="chev" />
            </button>
          ) : (
            <span />
          )}
        </div>
        {error && (
          <div className="body" style={{ pointerEvents: "auto" }}>
            <div className="sheet2" style={{ marginTop: 440 }}>
              <div className="empty">
                <b>{error}</b>
                <button className="btn o" style={{ width: "100%" }} onClick={() => goBack(router, "/feed")}>
                  Назад
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    );

  const photos = person.photos?.length ? person.photos : person.avatarUrl ? [person.avatarUrl] : [];
  const common = person.commonInterests ?? [];
  const others = person.interests.filter((i) => !common.includes(i));
  const meets = person.completedMeetingsCount;

  return (
    <section
      ref={card}
      className={`scr pr aurora ${deck ? `deck ${deck.from === 1 ? "dk-r" : deck.from === -1 ? "dk-l" : "dk-0"}` : "in"}`}
      data-id="person"
    >
      <div className="gal">
        {photos.length ? (
          photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} className={i === gi ? "on" : ""} alt="" />
          ))
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "var(--g)", display: "grid", placeItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mosyaSrc("wave")} alt="" style={{ width: 220, position: "static", opacity: 1, transform: "none" }} />
          </div>
        )}
        {photos.length > 1 && (
          <>
            <div className="gb">
              {photos.map((_, i) => (
                <i key={i} className={i <= gi ? "on" : ""} />
              ))}
            </div>
            <button className="tapL" onClick={() => setGi((gi - 1 + photos.length) % photos.length)} aria-label="Предыдущее фото" />
            <button className="tapR" onClick={() => setGi((gi + 1) % photos.length)} aria-label="Следующее фото" />
          </>
        )}
        <div className="nm">
          <h1>
            {person.name}
            {person.age ? `, ${person.age}` : ""}
          </h1>
          <p>
            {distanceLabel(person.distanceKm) && (
              <span className="pill glass dist">
                <Ic n="pin" c="xs" />
                {distanceLabel(person.distanceKm)}
              </span>
            )}
            {person.ratingAvg > 0 && <span className="pill glass">★ {person.ratingAvg.toFixed(1).replace(".", ",")}</span>}
            <span className="pill glass">
              {meets} {plural(meets, "встреча", "встречи", "встреч")}
            </span>
            {common.length > 0 && (
              <span className="pill glass">
                {common.length} {plural(common.length, "общий интерес", "общих интереса", "общих интересов")}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="hb">
        <button className="rb glass" onClick={() => goBack(router, "/feed")} aria-label="Назад">
          <Ic n="back" />
        </button>
        <button className="rb glass" onClick={() => setMoreOpen(true)} aria-label="Пожаловаться">
          <Ic n="flag" />
        </button>
      </div>
      {/* Прокрутка ловит касания сама (в Telegram на iOS прокрутка с pointer-events:none
          не листается), а нажатие по фото над карточкой листает галерею. */}
      <div
        className="body"
        style={{ pointerEvents: "auto" }}
        ref={bodyRef}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) swipe.current = { x: t.clientX, y: t.clientY, top: e.target === e.currentTarget, axis: null };
        }}
        onTouchMove={(e) => {
          const st = swipe.current;
          const t = e.touches[0];
          if (!st || !t || !deck) return;
          const dx = t.clientX - st.x;
          const dy = t.clientY - st.y;
          if (!st.axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) st.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          if (st.axis === "x" && card.current) {
            // Карточка тянется за пальцем, как в Tinder.
            card.current.style.transition = "none";
            card.current.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`;
          }
        }}
        onTouchEnd={(e) => {
          const st = swipe.current;
          swipe.current = null;
          const t = e.changedTouches[0];
          if (!st || !t) return;
          const dx = t.clientX - st.x;
          const dy = t.clientY - st.y;
          if (deck) {
            if (st.axis !== "x") return;
            // Свайп влево — следующий человек, вправо — предыдущий.
            if (Math.abs(dx) > 90) fly(dx < 0 ? 1 : -1);
            else snap();
            return;
          }
          if (!st.top || photos.length < 2) return;
          // Вне колоды свайп влево/вправо по фото — следующее/предыдущее фото.
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            setGi((g) => (dx < 0 ? (g + 1) % photos.length : (g - 1 + photos.length) % photos.length));
          }
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget || photos.length < 2) return;
          const r = e.currentTarget.getBoundingClientRect();
          const left = e.clientX - r.left < r.width / 2;
          setGi((g) => (left ? (g - 1 + photos.length) % photos.length : (g + 1) % photos.length));
        }}
      >
        <button
          className="upk"
          onClick={() => {
            const b = bodyRef.current;
            if (b) b.scrollTo({ top: b.scrollTop > 40 ? 0 : b.clientHeight * 0.55, behavior: "smooth" });
          }}
          aria-label="О себе"
        >
          <Ic n="up" />
        </button>
        <div className="sheet2" style={{ marginTop: 440 }}>
          <div className="blk">
            <div className="blk-h">
              <b>О себе</b>
            </div>
            <p className="about">{person.bio || "Пока без описания"}</p>
          </div>
          {common.length > 0 && (
            <div className="blk">
              <div className="blk-h">
                <b>Общие интересы</b>
                <span>
                  {common.length} из {person.interests.length}
                </span>
              </div>
              <div className="itags">
                {common.map((i) => (
                  <span key={i} className="itag common">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={interestIcon(i)} alt="" />
                    {i}
                  </span>
                ))}
              </div>
            </div>
          )}
          {others.length > 0 && (
            <div className="blk">
              <div className="blk-h">
                <b>{common.length ? "Ещё интересы" : "Интересы"}</b>
              </div>
              <div className="itags">
                {others.map((i) => (
                  <span key={i} className="itag gl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={interestIcon(i)} alt="" />
                    {i}
                  </span>
                ))}
              </div>
            </div>
          )}
          <button className="report" onClick={() => setMoreOpen(true)}>
            Пожаловаться или заблокировать
          </button>
        </div>
      </div>
      <div className="cta">
        <button className="rb gl" onClick={() =>
            person.canMessage === false
              ? say(NO_MEET_TEXT)
              : openDirect()
          }
          disabled={busy}
          aria-label="Написать"
          style={{ width: 56, height: 56, opacity: person.canMessage === false ? 0.45 : 1 }}
        >
          <Ic n="chat" />
        </button>
        <button className="btn v" onClick={openInvite}>
          <Ic n="cal" />
          Позвать на встречу
        </button>
      </div>

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <h2 className="t">
          Позвать <em>{person.name}</em>
        </h2>
        {suggestMeet(person.interests, common) && (
          <>
            <p className="muted" style={{ margin: "-6px 0 0", fontSize: 14 }}>
              Мося советует по интересам
            </p>
            <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
          {suggestMeet(person.interests, common)?.ideas.map((idea) => (
            <button
              key={idea.title}
              className="opt gl idea"
              onClick={() =>
                router.push(
                  `/create?category=${idea.category}${idea.type ? `&type=${idea.type}` : ""}&invite=${person.id}&inviteName=${encodeURIComponent(person.name)}`
                )
              }
            >
              <span className="idea-ic">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={idea.icon} alt="" />
              </span>
              <div className="d">
                <b>{idea.title}</b>
                <span>{idea.common ? "ваш общий интерес" : `любит: ${idea.interest.toLowerCase()}`} · создать и позвать</span>
              </div>
              <span className="mosya-tag">Совет Моси</span>
            </button>
          ))}
            </div>
          </>
        )}
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
          {myEvents?.length ? "Или позови на свою встречу" : "У тебя пока нет ближайших встреч"}
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {myEvents === null && <div className="sk" style={{ height: 70 }} />}
          {myEvents?.map((e) => (
            <button key={e.id} className={`opt gl ${pick === e.id ? "on" : ""}`} onClick={() => setPick(e.id)}>
              <Cover photoUrl={e.photoUrl} icon={eventIcon(e)} cls="ivth" thumb={100} />
              <div className="d">
                <b>{e.title}</b>
                <span>
                  {dayLong(e.eventDate)}, {e.eventTime.slice(0, 5)}
                </span>
              </div>
              <span className="radio" />
            </button>
          ))}
          <button
            className="opt gl"
            onClick={() => router.push(`/create?invite=${person.id}&inviteName=${encodeURIComponent(person.name)}`)}
          >
            <span style={{ width: 46, height: 46, borderRadius: 12, background: "var(--g)", color: "#fff", display: "grid", placeItems: "center", flex: "none" }}>
              <Ic n="plus" />
            </span>
            <div className="d">
              <b>Новая встреча</b>
              <span>создать — приглашение уйдёт само</span>
            </div>
          </button>
        </div>
        <p className="safe">
          <Ic n="shield" c="xs" />
          Для безопасности первая встреча — в людном месте. Написать лично можно после общей встречи.
        </p>
        <button className="btn v" disabled={!pick || busy} onClick={() => pick && openDirect(pick)}>
          {busy ? "Отправляем…" : "Отправить приглашение"}
        </button>
      </Sheet>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)}>
        <h2 className="t">Что случилось?</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {(
            [
              ["no_show", "Не пришёл на встречу"],
              ["bad_behavior", "Неприятное поведение"],
              ["fake_profile", "Фейковый профиль"],
              ["block", "Заблокировать"],
            ] as const
          ).map(([k, t]) => (
            <button key={k} className="opt gl" onClick={() => report(k)}>
              <b>{t}</b>
              <Ic n="chev" c="s" />
            </button>
          ))}
        </div>
        <button className="btn o" onClick={() => setMoreOpen(false)}>
          Отмена
        </button>
      </Sheet>
      <Toast text={toast} />
    </section>
  );
}

const NO_MEET_TEXT = "Пока написать нельзя — у вас ещё не было общей встречи. Позови на свою встречу или создай новую 😉";

function plural(n: number, a: string, b: string, c: string) {
  const m = n % 10;
  const h = n % 100;
  return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c;
}
