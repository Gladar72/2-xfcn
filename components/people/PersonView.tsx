"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { mosyaSrc } from "@/components/brand/Mosya";
import { interestIcon } from "@/lib/data/interests";
import { Cover, Ic, Sheet, Toast, dayLong, eventIcon } from "@/components/proto/ui";
import { MatchCelebration } from "@/components/people/MatchCelebration";
import { useGuide } from "@/lib/mosya/guide";
import { peek, say } from "@/lib/mosya/peek";
import { goBack } from "@/lib/nav/back";
import { photoThumb } from "@/lib/photos/thumb";
import { distanceLabel, personDistanceLabel } from "@/lib/geo/approx-distance";
import { suggestMeet } from "@/lib/mosya/suggest";

/** Разлёт маленьких сердечек при «сердечке» (фиксированный — одинаково каждый раз). */
const BURST = [
  { x: -96, y: -70, s: 1.1, r: -24, d: 0.08, c: "#FF8FB5" },
  { x: 92, y: -84, s: 0.9, r: 20, d: 0.1, c: "#FF4F8B" },
  { x: -120, y: 18, s: 0.8, r: -12, d: 0.12, c: "#C9A8FF" },
  { x: 118, y: 26, s: 1, r: 16, d: 0.09, c: "#FF8FB5" },
  { x: -54, y: -128, s: 0.7, r: -8, d: 0.14, c: "#2A2536" },
  { x: 48, y: -134, s: 1.2, r: 10, d: 0.07, c: "#FF4F8B" },
  { x: -70, y: 96, s: 0.7, r: -30, d: 0.13, c: "#FFD1E4" },
  { x: 74, y: 104, s: 0.8, r: 28, d: 0.11, c: "#C9A8FF" },
];

interface FollowInfo {
  following: boolean;
  followers: number;
  events: { id: string; title: string; eventDate: string; eventTime: string; photoUrl: string | null; isBusiness: boolean }[];
}

export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  photos?: string[];
  age: number;
  city?: string;
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
  distanceM?: number | null;
  /** "female" | "male" — для «поставил/поставила» на экране взаимности. */
  gender?: string | null;
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

/** Режим колоды «Люди рядом»: свайп в любую сторону — следующий человек. */
export interface DeckCtl {
  onSwipe: (dir: 1 | -1) => void;
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
  // Подписка на организатора: новые открытые события приходят сами (в бот и push).
  const [follow, setFollow] = useState<FollowInfo | null>(null);
  useEffect(() => {
    if (!person?.id) return;
    setFollow(null);
    fetch(`/api/follows?userId=${person.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setFollow({ following: !!d.following, followers: d.followers ?? 0, events: Array.isArray(d.events) ? d.events : [] }))
      .catch(() => {});
  }, [person?.id]);
  async function toggleFollow() {
    if (!person || !follow) return;
    const next = !follow.following;
    setFollow({ ...follow, following: next, followers: Math.max(0, follow.followers + (next ? 1 : -1)) });
    try {
      const res = await fetch("/api/follows", { method: next ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: person.id }) });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d) throw new Error("follow");
      setFollow((f) => (f ? { ...f, following: !!d.following, followers: d.followers ?? f.followers } : f));
      setToast(next ? `Подписка оформлена — новые события ${person.name} придут сами` : "Подписка отменена");
      setTimeout(() => setToast(null), 2600);
    } catch {
      setFollow((f) => (f ? { ...f, following: !next, followers: Math.max(0, f.followers + (next ? -1 : 1)) } : f));
      setToast("Не получилось — попробуй ещё раз");
      setTimeout(() => setToast(null), 2200);
    }
  }
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
  // Пришли с экрана «Это взаимно!» при входе: ?act=invite — сразу позвать, ?act=chat — написать.
  const actDone = useRef(false);
  useEffect(() => {
    if (!person || deck || actDone.current) return;
    let act: string | null = null;
    try {
      act = new URLSearchParams(window.location.search).get("act");
    } catch {
      return;
    }
    if (act !== "invite" && act !== "chat") return;
    actDone.current = true;
    if (act === "invite") openInvite();
    else if (person.canMessage === false) say(NO_MEET_TEXT);
    else openDirect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person, deck]);
  useGuide(deck ? "deck" : "person", { when: person !== null, force: !!deck });

  // Колода сначала даёт короткую карточку (имя, фото), потом полный профиль —
  // подменяем без перерисовки экрана, чтобы не было мигания.
  useEffect(() => {
    if (initial) setPerson((p) => (p && p.id === initial.id && p.bio !== undefined && initial.bio === undefined ? { ...p, city: initial.city, distanceKm: initial.distanceKm, distanceM: initial.distanceM } : initial));
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
      im.src = photoThumb(src, 300, true);
    }
  }, [person?.photos]);

  /** Карточка улетает в сторону, потом колода показывает следующего. */
  const flying = useRef(false);
  const flyTimer = useRef<ReturnType<typeof setTimeout>>();
  const suppressClick = useRef(false);
  useEffect(() => () => {
    clearTimeout(flyTimer.current);
  }, []);

  // React delegates touchmove passively. Claim only horizontal gestures here;
  // vertical gestures remain native scrolling, including the profile details.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const lockAxis = (e: TouchEvent) => {
      const st = swipe.current;
      const t = e.touches[0];
      if (!st || !t || e.touches.length !== 1) return;
      const dx = t.clientX - st.x;
      const dy = t.clientY - st.y;
      if (!st.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
        st.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
      }
      if (st.axis === "x" && e.cancelable) e.preventDefault();
    };
    body.addEventListener("touchmove", lockAxis, { passive: false });
    return () => body.removeEventListener("touchmove", lockAxis);
  }, [person?.id]);
  function fly(dir: 1 | -1) {
    const el = card.current;
    if (!deck || flying.current) return;
    flying.current = true;
    if (el) {
      el.style.transition = "transform .22s cubic-bezier(.3,.6,.4,1), opacity .22s";
      el.style.transform = `translate3d(${dir * -120}%,0,0) rotate(${dir * -12}deg)`;
      el.style.opacity = "0";
    }
    flyTimer.current = setTimeout(() => deck.onSwipe(dir), 220);
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
      className={`scr pr pr2 aurora ${deck ? `deck ${deck.from === 1 ? "dk-r" : deck.from === -1 ? "dk-l" : "dk-0"}` : "in"}`}
      data-id="person"
      data-transition={deck ? "deck" : undefined}
    >
      {/* Фон экрана — то же фото, размытое и затемнённое: у каждого человека свой цвет. */}
      <div className="evbg" aria-hidden style={photos[gi] ? { backgroundImage: `url(${photoThumb(photos[gi]!, 120)})` } : undefined} />
      <div className="gal">
        {photos.length ? (
          photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={photoThumb(src, 300, true)} className={i === gi ? "on" : ""} alt="" decoding="async" />
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
          <div className="person-title">
          <h1>
            {person.name}
            {person.age ? `, ${person.age}` : ""}
          </h1>
          </div>
          <p>
            {(person.distanceM !== undefined ? personDistanceLabel(person.distanceM) : distanceLabel(person.distanceKm)) && (
              <span className="pill glass dist">
                <Ic n="pin" c="xs" />
                {person.distanceM !== undefined ? personDistanceLabel(person.distanceM) : distanceLabel(person.distanceKm)}
              </span>
            )}
            {person.city && <span className="pill glass">{person.city}</span>}
            {person.ratingAvg > 0 && <span className="pill glass">★ {person.ratingAvg.toFixed(1).replace(".", ",")}</span>}
            <span className="pill glass">
              {meets} {plural(meets, "встреча", "встречи", "встреч")}
            </span>
            {common.length > 0 && (
              <span className="pill glass">
                {common.length} {plural(common.length, "общий интерес", "общих интереса", "общих интересов")}
              </span>
            )}
            {follow && follow.followers > 0 && (
              <span className="pill glass">
                {follow.followers} {plural(follow.followers, "подписчик", "подписчика", "подписчиков")}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="hb">
        <button className="rb glass" onClick={() => goBack(router, "/feed")} aria-label="Назад">
          <Ic n="back" />
        </button>
        {!deck && <button className="rb glass" onClick={() => setMoreOpen(true)} aria-label="Пожаловаться">
          <Ic n="flag" />
        </button>}
      </div>
      {/* Прокрутка ловит касания сама (в Telegram на iOS прокрутка с pointer-events:none
          не листается), а нажатие по фото над карточкой листает галерею. */}
      <div
        className="body"
        style={{ pointerEvents: "auto" }}
        ref={bodyRef}
        onTouchStart={(e) => {
          swipe.current = null;
          suppressClick.current = false;
          if (e.touches.length !== 1 || flying.current) { if (!flying.current) snap(); return; }
          if ((e.target as Element).closest("button, a, input, textarea, select, [role=button]")) return;
          const t = e.touches[0];
          if (t) swipe.current = { x: t.clientX, y: t.clientY, t: Date.now(), top: e.target === e.currentTarget, axis: null };
        }}
        onTouchMove={(e) => {
          const st = swipe.current;
          const t = e.touches[0];
          if (!st || !t || flying.current) return;
          if (e.touches.length !== 1) { swipe.current = null; suppressClick.current = true; snap(); return; }
          const dx = t.clientX - st.x;
          const dy = t.clientY - st.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) > 10) suppressClick.current = true;
          if (!st.axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) st.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
          if (st.axis === "x" && deck && card.current) {
            const el = card.current;
            // A new gesture owns the transform; the entry animation must stop.
            el.style.animation = "none";
            // The browser batches transform paints without a layout read.
            // Apply the drag immediately: a delayed rAF in WebKit can leave
            // a quick reverse gesture stuck on the incoming card's position.
            el.style.transition = "none";
            el.style.transform = `translate3d(${dx}px,0,0) rotate(${dx / 26}deg)`;
          }
        }}
        onTouchCancel={() => {
          swipe.current = null;
          suppressClick.current = true;
          if (!flying.current) snap();
        }}
        onTouchEnd={(e) => {
          const st = swipe.current;
          swipe.current = null;
          const t = e.changedTouches[0];
          if (!st || !t || flying.current) return;
          const dx = t.clientX - st.x;
          const dy = t.clientY - st.y;
          if (deck) {
            if (st.axis !== "x") return;
            const fast = Math.abs(dx) > 35 && Date.now() - st.t < 300;
            if (Math.abs(dx) > 90 || fast) fly(dx < 0 ? 1 : -1);
            else snap();
            return;
          }
          if (!st.top || photos.length < 2 || st.axis !== "x") return;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            setGi((g) => (dx < 0 ? (g + 1) % photos.length : (g - 1 + photos.length) % photos.length));
          }
        }}
        onClickCapture={(e) => {
          if (!suppressClick.current || e.detail === 0) return;
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget || photos.length < 2) return;
          const r = e.currentTarget.getBoundingClientRect();
          const left = e.clientX - r.left < r.width / 2;
          setGi((g) => (left ? (g - 1 + photos.length) % photos.length : (g + 1) % photos.length));
        }}
      >
        {deck && <button className="rb people-profile-menu" aria-label="Меню профиля" onClick={() => setMoreOpen(true)}><Ic n="more" /></button>}
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
          {follow && follow.events.length > 0 && (
            <div className="blk">
              <div className="blk-h">
                <b>Ближайшие события</b>
                <span>{follow.events.length}</span>
              </div>
              <div className="fevs">
                {follow.events.map((e) => (
                  <Link key={e.id} className="fev" href={`/events/${e.id}`}>
                    <span className="d">
                      <small>{new Date(`${e.eventDate}T00:00:00`).toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</small>
                      <b>{Number(e.eventDate.slice(8, 10))}</b>
                    </span>
                    <Cover photoUrl={e.photoUrl} icon={eventIcon({ isBusiness: e.isBusiness })} cls="fim" thumb={120} />
                    <span className="t">
                      <b>{e.title}</b>
                      <span>{`${dayLong(e.eventDate).split(",")[0]}, ${e.eventTime.slice(0, 5)}`}</span>
                    </span>
                  </Link>
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
        {follow && (
          <button
            className={`rb gl fbell${follow.following ? " on" : ""}`}
            onClick={toggleFollow}
            aria-label={follow.following ? "Вы подписаны — отписаться" : "Подписаться на события"}
            aria-pressed={follow.following}
            style={{ width: 56, height: 56, flex: "none" }}
          >
            <Ic n="bell" />
          </button>
        )}
        <button className="btn v" onClick={openInvite}>
          <Ic n="cal" />
          <span>{follow ? "Позвать" : "Позвать на встречу"}</span>
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
          {/* маленькие сердечки разлетаются от большого */}
          {BURST.map((h, i) => (
            <svg key={i} className="hbst" viewBox="0 0 24 24" style={{ "--x": `${h.x}px`, "--y": `${h.y}px`, "--s": h.s, "--r": `${h.r}deg`, animationDelay: `${h.d}s` } as React.CSSProperties}>
              <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill={h.c} />
            </svg>
          ))}
        </div>
      )}

      <MatchCelebration
        open={matchOpen}
        me={meAvatar}
        other={{ name: person.name, avatarUrl: photos[0] ?? person.avatarUrl, gender: person.gender }}
        common={common}
        onClose={() => setMatchOpen(false)}
        onInvite={() => {
          setMatchOpen(false);
          openInvite();
        }}
        onMessage={() => {
          setMatchOpen(false);
          if (person.canMessage === false) say(NO_MEET_TEXT);
          else openDirect();
        }}
      />

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
