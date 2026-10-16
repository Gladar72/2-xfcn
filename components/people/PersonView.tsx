"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mosyaSrc } from "@/components/brand/Mosya";
import { interestIcon } from "@/lib/data/interests";
import { Cover, Ic, Sheet, Toast, dayLong, eventIcon } from "@/components/proto/ui";
import { useGuide } from "@/lib/mosya/guide";
import { peek, say } from "@/lib/mosya/peek";
import { goBack } from "@/lib/nav/back";
import { photoThumb } from "@/lib/photos/thumb";
import { distanceLabel } from "@/lib/geo/approx-distance";
import { suggestMeet } from "@/lib/mosya/suggest";

export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  photos?: string[];
  age: number;
  /** undefined — полный профиль ещё грузится. */
  bio?: string | null;
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
  const swipe = useRef<{ x: number; y: number; t: number; top: boolean; axis: "x" | "y" | null } | null>(null);
  const card = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState("");
  // «Сердечко»: поставил ли я, взаимно ли; вспышка сердца и экран «Это взаимно!».
  const [liked, setLiked] = useState(false);
  const [burst, setBurst] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [meAvatar, setMeAvatar] = useState<string | null>(null);
  useEffect(() => {
    if (!person?.id) return;
    setLiked(false);
    fetch(`/api/likes?userId=${person.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLiked(!!d.liked))
      .catch(() => {});
  }, [person?.id]);
  // Подсказка Моси про сердечко — один раз, на втором человеке в колоде (первый — общий гид).
  const seenInDeck = useRef(0);
  useEffect(() => {
    if (!deck || !person?.id) return;
    seenInDeck.current += 1;
    if (seenInDeck.current !== 2) return;
    try {
      if (localStorage.getItem("mesto_heart_tip") === "1") return;
      localStorage.setItem("mesto_heart_tip", "1");
    } catch {
      return;
    }
    const t = setTimeout(() => peek({ pose: "wave", text: `Нравится человек? Поставь сердечко — ${person.name} узнает. Взаимно — сразу скажу 💜`, ms: 6000 }), 900);
    return () => clearTimeout(t);
  }, [deck, person?.id, person?.name]);
  async function heart() {
    if (!person) return;
    if (liked) {
      say(`Сердечко у ${person.name} уже есть. Ответит взаимностью — скажу`);
      return;
    }
    setLiked(true);
    setBurst(true);
    setTimeout(() => setBurst(false), 900);
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: person.id, kind: "heart" }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setLiked(false);
        say("Сегодня сердечки закончились — завтра будут новые", "think");
        return;
      }
      if (!res.ok) {
        setLiked(false);
        return;
      }
      if (d.mutual) {
        fetch("/api/me/profile")
          .then((r) => r.json())
          .then((p) => setMeAvatar(p?.avatarUrl ?? null))
          .catch(() => {});
        setMatchOpen(true);
      } else {
        setToast(`Сердечко у ${person.name}. Ответит взаимностью — Мося сразу скажет`);
        setTimeout(() => setToast(null), 2600);
      }
    } catch {
      setLiked(false);
    }
  }
  useGuide(deck ? "deck" : "person", { when: person !== null, force: !!deck });

  // Колода сначала даёт короткую карточку (имя, фото), потом полный профиль —
  // подменяем без перерисовки экрана, чтобы не было мигания.
  useEffect(() => {
    if (initial) setPerson((p) => (p && p.id === initial.id && p.bio !== undefined && initial.bio === undefined ? p : initial));
  }, [initial]);

  useEffect(() => {
    if (initial) return;
    fetch(`/api/users/${id}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError("Профиль не найден.") : setPerson(d)))
      .catch(() => setError("Проблема с соединением."));
  }, [id, initial]);

  // Все фото человека грузим сразу — быстрые тапы не показывают пустоту.
  useEffect(() => {
    for (const src of person?.photos ?? []) {
      const im = new Image();
      im.decoding = "async";
      im.src = photoThumb(src, 300);
    }
  }, [person?.photos]);

  /** Карточка улетает в сторону, потом колода показывает следующего. */
  const flying = useRef(false);
  const raf = useRef(0);
  function fly(dir: 1 | -1) {
    const el = card.current;
    if (!deck || flying.current) return;
    if (dir === -1 && !deck.hasPrev) return snap();
    flying.current = true;
    if (el) {
      el.style.transition = "transform .22s cubic-bezier(.3,.6,.4,1), opacity .22s";
      el.style.transform = `translate3d(${dir * -120}%,0,0) rotate(${dir * -12}deg)`;
      el.style.opacity = "0";
    }
    setTimeout(() => deck.onSwipe(dir), 200);
  }
  function snap() {
    const el = card.current;
    if (!el) return;
    el.style.transition = "transform .28s cubic-bezier(.2,.9,.3,1.15)";
    el.style.transform = "translate3d(0,0,0)";
  }

  async function openDirect(eventId?: string) {
    if (!person || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/conversations/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: person.id, eventId, message: eventId ? inviteNote.trim() || undefined : undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.conversationId) {
        const INVITE_ERR: Record<string, string> = {
          event_unavailable: "Эта встреча уже закрыта — выбери другую",
          event_full: "На этой встрече не осталось мест",
          already_invited: `${person.name} уже приглашён на эту встречу — позвать можно один раз`,
          already_member: `${person.name} уже идёт на эту встречу`,
          invite_limit: `За сутки можно позвать не больше ${d.limit ?? 5} человек. Попробуй завтра`,
          not_your_event: "Позвать можно только на свою встречу",
          no_shared_event: NO_MEET_TEXT,
        };
        say(INVITE_ERR[d.error as string] ?? "Не получилось — попробуй ещё раз");
        return;
      }
      if (eventId) {
        setInviteOpen(false);
        setPick(null);
        setInviteNote("");
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

  // /people/<id>?invite=1 — пришли из карточки «Хочет на встречу»: сразу открываем «Позвать».
  const autoInvite = useRef(false);
  useEffect(() => {
    if (!person || deck || autoInvite.current) return;
    if (new URLSearchParams(window.location.search).get("invite") !== "1") return;
    autoInvite.current = true;
    openInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id, deck]);

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
            <img key={src} src={photoThumb(src, 300)} className={i === gi ? "on" : ""} alt="" decoding="async" />
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
          if (t && !flying.current) swipe.current = { x: t.clientX, y: t.clientY, t: Date.now(), top: e.target === e.currentTarget, axis: null };
        }}
        onTouchMove={(e) => {
          const st = swipe.current;
          const t = e.touches[0];
          if (!st || !t || !deck) return;
          const dx = t.clientX - st.x;
          const dy = t.clientY - st.y;
          if (!st.axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) st.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          if (st.axis === "x" && card.current) {
            // Карточка тянется за пальцем, как в Tinder (один кадр — одно обновление).
            const el = card.current;
            cancelAnimationFrame(raf.current);
            raf.current = requestAnimationFrame(() => {
              el.style.transition = "none";
              el.style.transform = `translate3d(${dx}px,0,0) rotate(${dx / 26}deg)`;
            });
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
            cancelAnimationFrame(raf.current);
            // Свайп влево — следующий человек, вправо — предыдущий.
            // Быстрый короткий взмах тоже считается.
            const fast = Math.abs(dx) > 35 && Date.now() - st.t < 300;
            if (Math.abs(dx) > 90 || fast) fly(dx < 0 ? 1 : -1);
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
            <p className="about">{person.bio === undefined ? "" : person.bio || "Пока без описания"}</p>
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
        <button
          className="rb gl"
          onClick={heart}
          aria-label={liked ? "Сердечко поставлено" : "Поставить сердечко"}
          aria-pressed={liked}
          style={{
            width: 56,
            height: 56,
            flex: "none",
            ...(liked ? { background: "linear-gradient(135deg,#FF8FB5,#FF4F8B)", boxShadow: "0 10px 26px rgba(255,79,139,.5)" } : {}),
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill={liked ? "#fff" : "none"} stroke={liked ? "#fff" : "currentColor"} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
          </svg>
        </button>
        <button className="btn v" onClick={openInvite}>
          <Ic n="cal" />
          Позвать на встречу
        </button>
      </div>

      {burst && (
        <div aria-hidden style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", zIndex: 60 }}>
          <svg width="150" height="150" viewBox="0 0 24 24" style={{ animation: "mHeart .9s ease-out forwards", filter: "drop-shadow(0 18px 40px rgba(255,79,139,.6))" }}>
            <defs>
              <linearGradient id="mhg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#FF9EC0" />
                <stop offset="1" stopColor="#FF3F80" />
              </linearGradient>
            </defs>
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="url(#mhg)" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <style>{`@keyframes mHeart{0%{transform:scale(.3);opacity:0}30%{transform:scale(1.1);opacity:1}60%{transform:scale(.95)}100%{transform:scale(1.25);opacity:0}}`}</style>
        </div>
      )}

      <Sheet open={matchOpen} onClose={() => setMatchOpen(false)}>
        <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", marginTop: 6 }}>
          {[meAvatar, photos[0] ?? person.avatarUrl].map((src, i) =>
            src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={photoThumb(src, 240)} alt="" style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", border: "4px solid #fff", boxShadow: "0 14px 30px rgba(80,40,170,.3)", transform: `rotate(${i ? 8 : -8}deg)`, margin: i ? "0 0 0 -16px" : "0 -16px 0 0", zIndex: i ? 2 : 1 }} />
            ) : (
              <span key={i} style={{ width: 96, height: 96, borderRadius: "50%", background: "#EFE8FF", border: "4px solid #fff", margin: i ? "0 0 0 -16px" : "0 -16px 0 0" }} />
            )
          )}
          <span style={{ position: "absolute", width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#FF8FB5,#FF4F8B)", display: "grid", placeItems: "center", border: "4px solid #fff", zIndex: 3 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
              <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
            </svg>
          </span>
        </div>
        <h2 className="t" style={{ textAlign: "center" }}>
          Это <em>взаимно!</em>
        </h2>
        <p className="muted" style={{ margin: "-6px 4px 0", textAlign: "center", fontSize: 15, lineHeight: 1.45 }}>
          {`${person.name} тоже поставил(а) тебе сердечко.`}
          {common.length ? ` Общее: ${common.slice(0, 3).join(", ").toLowerCase()}.` : ""}
        </p>
        <button
          className="btn v"
          onClick={() => {
            setMatchOpen(false);
            openInvite();
          }}
        >
          <Ic n="cal" />
          Позвать на встречу
        </button>
        <button
          className="btn o"
          onClick={() => {
            setMatchOpen(false);
            if (person.canMessage === false) say(NO_MEET_TEXT);
            else openDirect();
          }}
        >
          <Ic n="chat" />
          Написать
        </button>
      </Sheet>

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
        {(myEvents?.length ?? 0) > 0 && (
          <label className="field gl ta">
            <textarea
              rows={2}
              maxLength={300}
              value={inviteNote}
              onChange={(e) => setInviteNote(e.target.value)}
              placeholder="Пару слов от тебя (необязательно)"
            />
          </label>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Одного человека на встречу можно позвать один раз, всего — до 5 приглашений в сутки.
        </p>
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
