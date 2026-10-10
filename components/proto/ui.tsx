"use client";

/**
 * Общие детали экранов прототипа «Место» (стили — app/proto.css, область .P).
 * Разметка повторяет прототип один в один: те же классы, та же структура,
 * поэтому и вид, и анимации совпадают с презентацией.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon, type IconName } from "@/components/brand/Icon";
import { characterSvg, type Face, type Palette, type Shape } from "@/components/brand/characters";
import { CATEGORY_ICON, trainingIcon } from "@/lib/data/category-icons";
import { photoThumb } from "@/lib/photos/thumb";

/** Иконка прототипа: <svg class="ic s"> — размер и толщина задаются CSS. */
export function Ic({ n, c }: { n: IconName; c?: "s" | "xs" | string }) {
  return <Icon name={n} className={c ? `ic ${c}` : "ic"} />;
}

/** Живой персонаж-эмоция (облачко, звёздочка…) из прототипа. */
export function Chr({ shape, pal, face = "smile", seed }: { shape: Shape; pal: Palette; face?: Face; seed?: number }) {
  const html = useMemo(() => characterSvg(shape, pal, face, seed), [shape, pal, face, seed]);
  return <span style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: html }} />;
}

export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** Ряд лиц «кто идёт». */
export function Faces({ people, ring, me }: { people: Person[]; ring?: string; me?: boolean }) {
  return (
    <span className="faces" style={ring ? ({ ["--ring" as string]: ring } as React.CSSProperties) : undefined}>
      {people.slice(0, 3).map((p) =>
        p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.id} src={photoThumb(p.avatarUrl, 56)} alt="" />
        ) : (
          <span key={p.id}>{p.name.charAt(0).toUpperCase()}</span>
        )
      )}
      {me && <span className="me">Я</span>}
    </span>
  );
}

/** Иконка категории/тренировки/бизнеса для обложки и чипсов. */
export function eventIcon(e: { isBusiness?: boolean; category?: { slug: string } | null; trainingType?: { slug: string } | null }) {
  if (e.isBusiness) return CATEGORY_ICON.business ?? "";
  if (e.category?.slug === "training") return trainingIcon(e.trainingType?.slug);
  if (e.category?.slug === "custom") return "/brand/cat3d/i_games.webp";
  return (e.category && CATEGORY_ICON[e.category.slug]) || CATEGORY_ICON.custom || "";
}

/** Обложка: фото встречи или фирменная «gfx» с 3D-иконкой (как в прототипе). */
export function Cover({ photoUrl, icon, cls = "ph", thumb }: { photoUrl?: string | null; icon: string; cls?: string; thumb?: number }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={cls} src={thumb ? photoThumb(photoUrl, thumb) : photoUrl} alt="" />;
  }
  return (
    <div className={`${cls} gfx`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" />
    </div>
  );
}

const COST_SHORT: Record<string, string> = {
  each_pays: "за себя",
  organizer_treats: "угощаю",
  free: "бесплатно",
  negotiable: "договоримся",
};

export function costShort(e: { costType?: string | null; isBusiness?: boolean; businessPricingDetails?: string | null; businessPricingType?: string | null }) {
  if (e.isBusiness) {
    if (e.businessPricingType === "free") return "Бесплатно";
    return e.businessPricingDetails?.trim() || "Билет";
  }
  return (e.costType && COST_SHORT[e.costType]) || "за себя";
}

export function dayShort(dateIso: string) {
  const d = new Date(dateIso);
  const t = new Date();
  const a = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
}

export function dayLong(dateIso: string) {
  const s = dayShort(dateIso);
  if (s === "сегодня") return "Сегодня";
  if (s === "завтра") return "Завтра";
  const d = new Date(dateIso);
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
}

export interface HeroEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  placeName: string | null;
  seatsTotal: number;
  seatsTaken: number;
  photoUrl?: string | null;
  isLive?: boolean;
  isBoosted?: boolean;
  isAnonymous?: boolean;
  isBusiness?: boolean;
  organizerHidden?: boolean;
  costType?: string | null;
  businessPricingType?: string | null;
  businessPricingDetails?: string | null;
  category?: { slug: string; name?: string } | null;
  trainingType?: { slug: string; name?: string } | null;
  goingPreview?: Person[];
  organizer?: { name: string } | null;
}

/** Карточка «Популярное сегодня» (heroCard прототипа). */
export function HeroCard({ e, full }: { e: HeroEvent; full?: boolean }) {
  const going = e.seatsTaken + 1;
  const max = e.seatsTotal + 1;
  const isFull = e.seatsTaken >= e.seatsTotal;
  return (
    <Link href={`/events/${e.id}`} className="hero" style={full ? { width: "100%" } : undefined}>
      <Cover photoUrl={e.photoUrl} icon={eventIcon(e)} thumb={640} />
      {e.isLive ? (
        <span className="boost lv">
          <span className="live">
            <i />
            Идёт сейчас
          </span>
        </span>
      ) : e.isBoosted ? (
        <span className="boost">
          <Ic n="up" c="xs" />
          Поднято
        </span>
      ) : null}
      {isFull && <span className="fullb">Заполнено</span>}
      <div className="tl">
        <span className="pill glass">
          {e.isBusiness ? (
            <>
              <span className="bzl">{(e.organizer?.name ?? "Б").charAt(0).toUpperCase()}</span>
              {e.organizer?.name ?? "Бизнес событие"}
            </>
          ) : (
            <>
              <Faces people={e.goingPreview ?? []} ring="rgba(255,255,255,.55)" /> {going} {isFull ? "· мест нет" : `из ${max}`}
            </>
          )}
        </span>
        {e.isAnonymous ? (
          <span className="pill glass">Анонимно</span>
        ) : (
          <span className="rb glass" style={{ width: 38, height: 38 }}>
            <Ic n="save" c="s" />
          </span>
        )}
      </div>
      <div className="bar hb2">
        {/* Название целиком (до двух строк) на тёмной подложке — читается на любом фото */}
        <b className="ttl">{e.title}</b>
        <div className="dt">
          <b>{e.eventTime.slice(0, 5)}</b>
          <small>{dayShort(e.eventDate)}</small>
        </div>
        <div className="i">
          <span>
            <Ic n="pin" c="xs" />
            {e.organizerHidden ? "место — после одобрения" : e.placeName ?? "место уточняется"}
          </span>
        </div>
        <span className="price">{costShort(e)}</span>
      </div>
    </Link>
  );
}

/** Строка встречи (rowCard прототипа). */
export function RowCard({
  e,
  status,
  onJoin,
}: {
  e: HeroEvent & { isMine?: boolean };
  status?: "pending" | "accepted" | "rejected" | null;
  onJoin?: (id: string) => void;
}) {
  const going = e.seatsTaken + 1;
  const max = e.seatsTotal + 1;
  const isFull = e.seatsTaken >= e.seatsTotal;
  return (
    <Link href={`/events/${e.id}`} className={`row gl ${e.isBusiness ? "bz" : ""}`}>
      <Cover photoUrl={e.photoUrl} icon={eventIcon(e)} cls="th" thumb={160} />
      <div className="i">
        <b>{e.title}</b>
        <span>
          {e.isBusiness ? (
            <span className="bztag">Бизнес</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ci2" src={eventIcon(e)} alt="" />
          )}
          {dayLong(e.eventDate)}, {e.eventTime.slice(0, 5)}
          {e.isAnonymous && e.organizerHidden ? " · анонимно" : ""}
        </span>
        <span>
          <Faces people={e.goingPreview ?? []} />{" "}
          {e.isLive && (
            <span className="live">
              <i />
              Идёт сейчас
            </span>
          )}
          {!e.isLive && e.isBoosted && (
            <span className="upb">
              <Ic n="up" c="xs" />
              Поднято
            </span>
          )}
          {isFull ? (
            <i className="fulli">Заполнено</i>
          ) : (
            <>
              {going} из {max} · <i className="need">нужно ещё {max - going}</i>
            </>
          )}
        </span>
      </div>
      <GoBtn e={e} status={status} onJoin={onJoin} />
    </Link>
  );
}

export function GoBtn({
  e,
  status,
  onJoin,
}: {
  e: { id: string; isMine?: boolean; isBusiness?: boolean; seatsTaken: number; seatsTotal: number };
  status?: "pending" | "accepted" | "rejected" | null;
  onJoin?: (id: string) => void;
}) {
  if (e.isMine) return <span className="go-s mine">Твоя</span>;
  if (status === "accepted") return <span className="go-s on">{e.isBusiness ? "Билет" : "Иду ✓"}</span>;
  if (status === "pending") return <span className="go-s wait">Ждём ответа</span>;
  if (status === "rejected") return <span className="go-s full">Не в этот раз</span>;
  if (e.seatsTaken >= e.seatsTotal) return <span className="go-s full">Мест нет</span>;
  return (
    <button
      className="go-s"
      onClick={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onJoin?.(e.id);
      }}
    >
      Я иду
    </button>
  );
}

/** Схематичная мини-карта (miniMap прототипа). */
export function MiniMap() {
  return (
    <svg viewBox="0 0 350 150" preserveAspectRatio="xMidYMid slice">
      <rect width="350" height="150" fill="#F3EFFA" />
      <path d="M-10 110 C80 80 140 130 220 112 S330 70 360 90 L360 150 L-10 150Z" fill="#E3D9F7" />
      <g stroke="#fff" strokeWidth="8" fill="none" strokeLinecap="round">
        <path d="M-10 40 L360 20" />
        <path d="M90 -10 L120 160" />
        <path d="M250 -10 L265 160" />
      </g>
      <g stroke="#fff" strokeWidth="4" fill="none">
        <path d="M-10 75 L360 62" />
        <path d="M180 -10 L188 100" />
      </g>
      <circle cx="185" cy="58" r="20" fill="rgba(108,59,255,.15)" />
      <circle cx="185" cy="58" r="8" fill="#6C3BFF" stroke="#fff" strokeWidth="3" />
    </svg>
  );
}

/** Экран прототипа: <section class="scr aurora fade"><div class="scroll">. */
export function Screen({
  id,
  children,
  plain,
  anim = "fade",
  className = "",
  scrollClass = "",
}: {
  id: string;
  children: React.ReactNode;
  plain?: boolean;
  anim?: "fade" | "in" | "up" | "";
  className?: string;
  scrollClass?: string;
}) {
  return (
    <section className={`scr aurora ${anim} ${className}`} data-id={id}>
      {plain ? children : <div className={`scroll ${scrollClass}`}>{children}</div>}
    </section>
  );
}

/**
 * Слой поверх экрана: шторки, тосты, «Задать вопрос» живут в корне .P
 * (как в прототипе), а не внутри прокрутки экрана — иначе уезжали бы с ней.
 */
export function Overlay({ children }: { children: React.ReactNode }) {
  const [root, setRoot] = useState<Element | null>(null);
  useEffect(() => setRoot(document.querySelector(".P") ?? document.body), []);
  return root ? createPortal(children, root) : null;
}

/**
 * Шторка прототипа (.scrim + .sheetx): выезжает пружиной, закрывается
 * тапом по затемнению. open=false — плавно уезжает и размонтируется.
 */
export function Sheet({
  open,
  onClose,
  children,
  cls = "",
  grab = true,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  cls?: string;
  grab?: boolean;
}) {
  const [mounted, setMounted] = useState(open);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
      return () => cancelAnimationFrame(r);
    }
    setOn(false);
    const t = setTimeout(() => setMounted(false), 450);
    return () => clearTimeout(t);
  }, [open]);
  if (!mounted) return null;
  return (
    <Overlay>
      <div className={`scrim ${on ? "on" : ""}`} onClick={onClose} />
      <div className={`sheetx ${cls} ${on ? "on" : ""}`} role="dialog">
        {grab && <span className="grab" />}
        {children}
      </div>
    </Overlay>
  );
}

/** Тост прототипа (сверху, с галочкой). */
export function Toast({ text }: { text: string | null }) {
  const [shown, setShown] = useState<string | null>(text);
  useEffect(() => {
    if (text) setShown(text);
  }, [text]);
  return (
    <Overlay>
      <div className={`toast ${text ? "on" : ""}`} role="status">
        <Ic n="check" />
        <span>{shown}</span>
      </div>
    </Overlay>
  );
}

/** Иллюстрация пустого состояния: три персонажа-эмоции (emptyIll прототипа). */
export function EmptyIll({
  a = ["flower", "sky", "calm"],
  b = ["clover", "violet", "wow"],
  c = ["star", "peach", "smile"],
}: {
  a?: [Parameters<typeof Chr>[0]["shape"], Parameters<typeof Chr>[0]["pal"], Parameters<typeof Chr>[0]["face"]];
  b?: [Parameters<typeof Chr>[0]["shape"], Parameters<typeof Chr>[0]["pal"], Parameters<typeof Chr>[0]["face"]];
  c?: [Parameters<typeof Chr>[0]["shape"], Parameters<typeof Chr>[0]["pal"], Parameters<typeof Chr>[0]["face"]];
}) {
  return (
    <div className="ill">
      <span style={{ left: 6, top: 36, width: 70, height: 70, position: "absolute" }}>
        <Chr shape={a[0]} pal={a[1]} face={a[2]} />
      </span>
      <span style={{ left: 52, top: 0, width: 86, height: 86, position: "absolute" }}>
        <Chr shape={b[0]} pal={b[1]} face={b[2]} />
      </span>
      <span style={{ left: 112, top: 52, width: 62, height: 62, position: "absolute" }}>
        <Chr shape={c[0]} pal={c[1]} face={c[2]} />
      </span>
    </div>
  );
}

