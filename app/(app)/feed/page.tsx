"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useGuide } from "@/lib/mosya/guide";
import { say } from "@/lib/mosya/peek";
import { JoinFlow } from "@/components/events/JoinFlow";
import { CATEGORY_ICON, trainingIcon } from "@/lib/data/category-icons";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { photoThumb } from "@/lib/photos/thumb";
import { interestIcon } from "@/lib/data/interests";
import { Chr, Cover, EmptyIll, HeroCard, Ic, MiniMap, RowCard, Screen, Sheet, Toast, eventIcon, type HeroEvent } from "@/components/proto/ui";
import type { ApplicationStatus } from "@/components/applications/ApplicationStatus";
import { goBack } from "@/lib/nav/back";
import { CityWheel } from "@/components/proto/pickers";
import { RUSSIAN_CITIES } from "@/lib/data/russian-cities";
import { KIND_LABEL, cityEventIcon } from "@/lib/city-events";
import { distanceShort } from "@/lib/geo/approx-distance";
import { refreshLocationSilently, sendMyLocation } from "@/lib/geo/client-location";

interface Category {
  id: string;
  slug: string;
  name: string;
}
interface TrainingType {
  id: string;
  slug: string;
  name: string;
}
type FeedEvent = HeroEvent & { isMine?: boolean; myApplicationStatus?: ApplicationStatus | null };
interface PersonCard {
  id: string;
  name: string;
  age: number;
  avatarUrl: string | null;
  sharedInterests: string[];
  sharedCount: number;
  distanceM?: number | null;
}
interface MyEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  photoUrl: string | null;
  role?: string;
  category?: { slug: string } | null;
  isBusiness?: boolean;
}

/** Короткие подписи категорий — как в чипсах прототипа. */
const SHORT: Record<string, string> = {
  training: "Тренировка",
  cinema: "Кино",
  coffee: "Кофе",
  breakfast: "Завтрак",
  dinner: "Ужин",
  walk: "Прогулка",
  active: "Активный отдых",
  party: "Вечеринка",
};

export default function FeedPage() {
  return (
    <Suspense>
      <FeedPageContent />
    </Suspense>
  );
}

function FeedPageContent() {
  const sp = useSearchParams();
  const category = sp.get("category");
  const type = sp.get("type");
  return category ? <CategoryScreen slug={category} type={type} /> : <HomeScreen />;
}

/* ================= главная ================= */
function HomeScreen() {
  const router = useRouter();
  const [city, setCity] = useState<string | null>(null);
  const [cityOpen, setCityOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [biz, setBiz] = useState<FeedEvent[]>([]);
  const [cityEv, setCityEv] = useState<CityEvent[]>([]);
  const [people, setPeople] = useState<PersonCard[]>([]);
  // Есть ли у меня свежая примерная точка — иначе предлагаем «Показать, кто рядом».
  const [meHasLoc, setMeHasLoc] = useState(true);
  const [geoBusy, setGeoBusy] = useState(false);
  const [plan, setPlan] = useState<{ ev: MyEvent; label: string } | null>(null);
  // Новая заявка на мою встречу — плашка вместо «Ты в деле» (главнее).
  const [req, setReq] = useState<{
    count: number;
    latest: { eventId: string; eventTitle: string; name: string; age: number | null; avatarUrl: string | null };
  } | null>(null);
  const [unreadChats, setUnreadChats] = useState(0);
  const [unreadNotif, setUnreadNotif] = useState(false);
  const [trainOpen, setTrainOpen] = useState(false);
  const [empty, setEmpty] = useState<{ slug: string; name: string; type?: string } | null>(null);
  useGuide("feed", { when: events !== null });

  // «Люди рядом» и «Популярное» каждый раз приходят немного перемешанными (?shuffle=1 и
  // случайная добавка в /api/people) — лента живая, а не одни и те же карточки.
  const loadPeople = useCallback(() => {
    return fetch("/api/people")
      .then((r) => r.json())
      .then((d) => {
        setPeople(Array.isArray(d.items) ? d.items : []);
        setMeHasLoc(d.meHasLocation !== false);
      })
      .catch(() => {});
  }, []);
  const loadEvents = useCallback((c: string) => {
    return fetch(`/api/events?page=0&shuffle=1&city=${encodeURIComponent(c)}`)
      .then((r) => r.json())
      .then((d) => setEvents(d.items ?? []))
      .catch(() => setEvents((prev) => prev ?? []));
  }, []);
  const cityRef = useRef<string | null>(null);
  cityRef.current = city;

  // Свежая геопозиция (если разрешение уже дано) → расстояния и «рядом» точнее.
  useEffect(() => {
    refreshLocationSilently().then((ok) => {
      if (!ok) return;
      loadPeople();
      if (cityRef.current) loadEvents(cityRef.current);
    });
  }, [loadPeople, loadEvents]);

  // Пока главная открыта — раз в 2 минуты подтягиваем новые подборки.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadPeople();
      if (cityRef.current) loadEvents(cityRef.current);
    }, 120e3);
    return () => clearInterval(t);
  }, [loadPeople, loadEvents]);

  // Счётчик «увидели» у продвинутых встреч — один раз за заход (и при смене набора).
  const seenRef = useRef("");
  useEffect(() => {
    const ids = (events ?? []).filter((e) => e.isPromoted && !e.isMine).map((e) => e.id);
    const key = ids.join(",");
    if (!ids.length || seenRef.current === key) return;
    seenRef.current = key;
    fetch("/api/promotions/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventIds: ids }) }).catch(() => {});
  }, [events]);

  async function allowGeo() {
    setGeoBusy(true);
    const ok = await sendMyLocation();
    setGeoBusy(false);
    if (ok) {
      loadPeople();
      if (city) loadEvents(city);
    } else {
      say("Не получилось узнать, где ты. Разреши геопозицию в настройках — и я покажу, кто рядом");
    }
  }

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((d) => setCity(d.city || "Тюмень"))
      .catch(() => setCity("Тюмень"));
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => {
        setCategories(d.categories ?? []);
        setTrainingTypes(d.trainingTypes ?? []);
      })
      .catch(() => {});
    loadPeople();
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((d) => setUnreadChats((d.items ?? []).reduce((s: number, i: { unreadCount?: number }) => s + (i.unreadCount || 0), 0)))
      .catch(() => {});
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setUnreadNotif((d.items ?? []).some((n: { isRead?: boolean }) => !n.isRead)))
      .catch(() => {});
    fetch("/api/me/pending-applications")
      .then((r) => r.json())
      .then((d) => {
        if (d?.latest) setReq({ count: d.count ?? 1, latest: d.latest });
      })
      .catch(() => {});
    fetch("/api/me/events?scope=upcoming")
      .then((r) => r.json())
      .then((d) => {
        const mine = ((d.items ?? d.events ?? []) as MyEvent[]).filter((e) => e.role !== "organizer");
        if (mine[0]) setPlan({ ev: mine[0], label: "Ты в деле" });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!city) return;
    loadEvents(city);
    fetch(`/api/events?business=true&city=${encodeURIComponent(city)}`)
      .then((r) => r.json())
      .then((d) => setBiz((d.items ?? []).filter((e: FeedEvent) => e.isBusiness)))
      .catch(() => {});
    fetch(`/api/city-events?city=${encodeURIComponent(city)}`)
      .then((r) => r.json())
      .then((d) => setCityEv(d.items ?? []))
      .catch(() => {});
  }, [city]);

  // Заявка «ждём ответа» тоже показывается плашкой сверху (если нет подтверждённой).
  useEffect(() => {
    if (plan || !events) return;
    const p = events.find((e) => e.myApplicationStatus === "pending");
    if (p) setPlan({ ev: { id: p.id, title: p.title, eventDate: p.eventDate, eventTime: p.eventTime, photoUrl: p.photoUrl ?? null, category: p.category, isBusiness: p.isBusiness }, label: "Заявка отправлена" });
  }, [events, plan]);

  async function openCategory(c: Category, typeSlug?: string) {
    if (c.slug === "training" && !typeSlug) {
      setTrainOpen(true);
      return;
    }
    setTrainOpen(false);
    const q = new URLSearchParams({ category: c.slug, page: "0" });
    if (typeSlug) q.set("type", typeSlug);
    if (city) q.set("city", city);
    try {
      const d = await fetch(`/api/events?${q}`).then((r) => r.json());
      if (Array.isArray(d.items) && d.items.length === 0) {
        const tName = trainingTypes.find((t) => t.slug === typeSlug)?.name;
        setEmpty({ slug: c.slug, name: tName ?? SHORT[c.slug] ?? c.name, type: typeSlug });
        return;
      }
    } catch {
      /* сеть — просто открываем раздел */
    }
    router.push(`/feed?category=${c.slug}${typeSlug ? `&type=${typeSlug}` : ""}`);
  }

  // «Популярное сегодня»: сначала все продвинутые встречи города (и бизнес тоже) в порядке
  // с сервера, за ними — все обычные личные встречи (бизнес без продвижения — только в «Афише»).
  // «Популярное сегодня» — только встречи людей (продвинутые первыми);
  // все бизнес-события — в «Афише заведений» (тоже продвинутые первыми).
  const personal = (events ?? []).filter((e) => !e.isBusiness);
  const pop = [...personal.filter((e) => e.isPromoted), ...personal.filter((e) => !e.isPromoted)];
  const bizSorted = [...biz.filter((e) => e.isPromoted || e.isBoosted), ...biz.filter((e) => !(e.isPromoted || e.isBoosted))];
  const nearN = (events ?? []).filter((e) => !e.isBusiness && !e.isMine).length;
  const cats = categories.filter((c) => c.slug !== "custom");
  const training = categories.find((c) => c.slug === "training");

  return (
    <Screen id="home">
      <div className="top">
        <button className="loc" onClick={() => setCityOpen(true)}>
          <small>Ищем компанию в</small>
          <b data-city>
            {city ?? "…"} <Ic n="down" c="s" />
          </b>
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="rb gl" href="/chats" aria-label="Чаты">
            <Ic n="chat" />
            {unreadChats > 0 && <span className="cnt">{unreadChats > 9 ? "9+" : unreadChats}</span>}
          </Link>
          <Link className="rb gl" href="/notifications" aria-label="Уведомления">
            <Ic n="bell" />
            {unreadNotif && <span className="dot" />}
          </Link>
        </div>
      </div>

      <Link className="ttl" href="/search">
        <h1 className="t" style={{ fontSize: 30 }}>
          Что ищешь <em>сегодня?</em>
        </h1>
        <span className="ar">
          <Ic n="chev" c="s" />
        </span>
      </Link>

      {req ? (
        <Link className="plan" href={`/events/${req.latest.eventId}`} aria-label="Открыть новую заявку">
          <span style={{ position: "relative", flex: "none", display: "flex" }}>
            {req.latest.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoThumb(req.latest.avatarUrl, 120)} alt="" style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover", border: "2px solid #fff" }} />
            ) : (
              <span style={{ width: 46, height: 46, borderRadius: "50%", border: "2px solid #fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 18, background: "rgba(255,255,255,.25)" }}>
                {req.latest.name.slice(0, 1)}
              </span>
            )}
            <span style={{ position: "absolute", right: -7, bottom: -4, background: "#fff", color: "#6C3BFF", fontSize: 11, fontWeight: 800, borderRadius: 99, padding: "1px 5px" }}>
              +{req.count}
            </span>
          </span>
          <div>
            <span>{`Новая заявка · «${req.latest.eventTitle.length > 14 ? `${req.latest.eventTitle.slice(0, 13).trim()}…` : req.latest.eventTitle}»`}</span>
            <b>{`${req.latest.name}${req.latest.age ? `, ${req.latest.age}` : ""} хочет пойти`}</b>
          </div>
          <Ic n="chev" c="s" />
        </Link>
      ) : plan && (
        <Link className="plan" href={`/events/${plan.ev.id}`}>
          <Cover photoUrl={plan.ev.photoUrl} icon={eventIcon(plan.ev)} cls="" thumb={120} />
          <div>
            <span>
              {plan.label} · {whenText(plan.ev.eventDate, plan.ev.eventTime)}
            </span>
            <b>{plan.ev.title}</b>
          </div>
          <Ic n="chev" c="s" />
        </Link>
      )}

      <div className="search">
        <Link className="sfield gl" href="/search">
          <Ic n="search" c="s" />
          Кофе, пробежка, кино…
        </Link>
        <Link className="rb k" href="/search?filters=1" aria-label="Фильтры" style={{ width: 50, height: 50 }}>
          <Ic n="filter" />
        </Link>
      </div>

      <div className="cats" style={{ marginTop: 14 }}>
        {cats.map((c) => (
          <button key={c.id} className="cat gl" onClick={() => openCategory(c)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CATEGORY_ICON[c.slug] ?? CATEGORY_ICON.custom} alt="" />
            {SHORT[c.slug] ?? c.name}
          </button>
        ))}
        <Link className="cat gl" href="/search">
          <span className="ownic">
            <Chr shape="cloud" pal="mint" face="smile" />
          </span>
          Другое
        </Link>
      </div>

      <div className="sec">
        <b>Популярное сегодня</b>
        <Link href="/my-events" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Ic n="up" c="xs" />
          Попасть сюда
        </Link>
      </div>
      <div className="rail">
        {events === null
          ? [0, 1].map((i) => <div key={i} className="sk" style={{ flex: "none", width: 262, height: 290, borderRadius: 32 }} />)
          : pop.map((e) => <HeroCard key={e.id} e={e} />)}
        {events !== null && pop.length === 0 && (
          <Link href="/create" className="hero" style={{ display: "grid", placeItems: "center", textAlign: "center", color: "#fff", background: "var(--g)" }}>
            <div style={{ padding: 24 }}>
              <b style={{ fontSize: 18, fontWeight: 500 }}>Сегодня пока тихо</b>
              <p style={{ marginTop: 8, opacity: 0.9, fontSize: 14 }}>Создай первую встречу в своём городе</p>
            </div>
          </Link>
        )}
      </div>

      {people.length > 0 && (
        <>
          <div className="sec">
            <b>{people.some((q) => q.distanceM != null) ? "Люди рядом" : "Люди с похожими интересами"}</b>
            <Link href="/people">Листать →</Link>
          </div>
          {!meHasLoc && (
            <button className="nearb gl" onClick={allowGeo} disabled={geoBusy} style={{ width: "100%", marginTop: 0, marginBottom: 10, textAlign: "left", font: "inherit", color: "inherit", border: 0 }}>
              <span className="rb k" style={{ width: 42, height: 42, flex: "none", color: "#fff" }}>
                <Ic n="pin" c="s" />
              </span>
              <div>
                <b>{geoBusy ? "Ищем, кто рядом…" : "Показать, кто рядом"}</b>
                <span>Увидишь, сколько до людей и встреч — точный адрес никто не узнает</span>
              </div>
              <Ic n="chev" c="s" />
            </button>
          )}
          <div className="rail">
            {people.map((q) => (
              <Link key={q.id} className="pcard" href={`/people?start=${q.id}`}>
                {q.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoThumb(q.avatarUrl, 320)} alt="" />
                ) : (
                  <span className="tgava">{q.name.charAt(0).toUpperCase()}</span>
                )}
                {q.sharedCount > 0 && (
                  <span className="mt">
                    {q.sharedInterests.slice(0, 2).map((i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={interestIcon(i)} alt="" />
                    ))}
                    {q.sharedCount} {plural(q.sharedCount, "общий", "общих", "общих")}
                  </span>
                )}
                <div>
                  {q.distanceM != null && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginBottom: 4, padding: "2px 8px 2px 5px", borderRadius: 99, background: "rgba(255,255,255,.25)", backdropFilter: "blur(10px)", fontSize: 11.5, fontWeight: 600, opacity: 1 }}>
                      <Ic n="pin" c="xs" />
                      {distanceShort(q.distanceM)}
                    </span>
                  )}
                  <b>
                    {q.name}, {q.age}
                  </b>
                  <span>{q.sharedInterests.slice(0, 2).join(" · ")}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="afisha">
        <div className="af-h">
          <div>
            <small>Для бизнеса</small>
            <b>Афиша заведений</b>
          </div>
          <Link href="/business">
            Все <Ic n="chev" c="xs" />
          </Link>
        </div>
        <div className="rail">
          {bizSorted.map((e) => {
            const left = Math.max(0, e.seatsTotal - e.seatsTaken);
            return (
              <Link key={e.id} className="acard v" href={`/events/${e.id}`}>
                <Cover photoUrl={e.photoUrl} icon={eventIcon(e)} thumb={480} />
                {e.isLive ? (
                  <span className="ast lv">
                    <span className="live">
                      <i />
                      Идёт сейчас
                    </span>
                  </span>
                ) : e.isPromoted || e.isBoosted ? (
                  <span className="ast">
                    <Ic n="up" c="xs" />В популярном
                  </span>
                ) : null}
                <span className="vb">
                  <b>{e.title}</b>
                  <span className="vm">
                    <Ic n="cal" c="xs" />
                    {whenShort(e.eventDate, e.eventTime).replace(" · ", ", ")}
                    <i />
                    <Ic n="people" c="xs" />
                    {left > 0 ? `${left} ${plural(left, "место", "места", "мест")}` : "мест нет"}
                  </span>
                  <span className="vr">
                    <span className="vp">{e.businessPricingType === "free" ? "Бесплатно" : e.businessPricingDetails?.trim() || "Бесплатно"}</span>
                    {e.organizer?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="aava" src={photoThumb(e.organizer.avatarUrl, 80)} alt="" />
                    ) : (
                      <span className="aava">{(e.organizer?.name ?? "Б").charAt(0).toUpperCase()}</span>
                    )}
                  </span>
                </span>
              </Link>
            );
          })}
          {/* «Что ещё в городе»: события из открытых источников (после одобрения). */}
          {cityEv.map((c) => (
            <Link key={c.id} className="acard city" href={`/city/${c.id}`}>
              <Cover photoUrl={c.photoUrl} icon={cityEventIcon(c.kind)} thumb={480} />
              <span className="pill glass">
                {KIND_LABEL[c.kind ?? ""] ?? "В городе"}
              </span>
              <div className="acb">
                <b>{c.title}</b>
                <p>
                  <span className="ach">
                    <Ic n="cal" c="xs" />
                    {cityWhen(c)}
                  </span>
                </p>
                <p>
                  {c.placeName && <span className="ach">{c.placeName}</span>}
                  {c.priceText && <span className="ach pr">{c.priceText}</span>}
                </p>
              </div>
            </Link>
          ))}
          {/* Пока событий мало — приглашаем заведения разместить своё. */}
          {biz.length < 4 && (
            <Link className="acard invite" href="/business">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/cat3d/i_biz.webp" alt="" />
                <b>Здесь может быть ваше событие</b>
                <span>Бесплатно для заведений: концерты, квизы, дегустации</span>
              </div>
            </Link>
          )}
        </div>
      </div>

      <Link className="nearb gl" href="/map">
        <div className="nb-m">
          <MiniMap />
          <span>{nearN}</span>
        </div>
        <div>
          <b>
            {nearN > 0 ? `Ещё ${nearN} ${plural(nearN, "встреча", "встречи", "встреч")} рядом` : "Встречи на карте"}
          </b>
          <span>Смотри на карте или списком</span>
        </div>
        <Ic n="chev" c="s" />
      </Link>

      {/* шторки */}
      <Sheet open={trainOpen} onClose={() => setTrainOpen(false)}>
        <h2 className="t">
          Совместная <em>тренировка</em>
        </h2>
        <div className="igrid">
          {trainingTypes.map((t) => (
            <button key={t.id} className="it gl" onClick={() => training && openCategory(training, t.slug)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={trainingIcon(t.slug)} alt="" />
              {t.name}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={!!empty} onClose={() => setEmpty(null)}>
        <EmptyCat name={empty?.name ?? ""} />
        <Link className="btn v" href={`/create?category=${empty?.slug ?? ""}${empty?.type ? `&type=${empty.type}` : ""}`}>
          Создать первым
        </Link>
        <button className="btn o" onClick={() => setEmpty(null)}>
          Не сейчас
        </button>
      </Sheet>

      <Sheet open={cityOpen} onClose={() => setCityOpen(false)}>
        <h2 className="t">
          Выбери <em>город</em>
        </h2>
        {cityOpen && (
          <CityWheel
            value={city ?? ""}
            cities={RUSSIAN_CITIES}
            onPick={(selected) => {
              setCity(selected);
              setCityOpen(false);
              fetch("/api/me/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ city: selected }),
              }).catch(() => {});
            }}
          />
        )}
      </Sheet>
    </Screen>
  );
}

function EmptyCat({ name }: { name: string }) {
  return (
    <div className="anonbox">
      <div className="empty" style={{ padding: 0 }}>
        <EmptyIll />
      </div>
      <b>Такую встречу ещё никто не создал</b>
      <span>«{name}» в твоём городе пока нет ни одной активной встречи — стань первым.</span>
    </div>
  );
}

/* ================= экран категории ================= */
function CategoryScreen({ slug, type }: { slug: string; type: string | null }) {
  const router = useRouter();
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [title, setTitle] = useState(SHORT[slug] ?? "");
  const [statuses, setStatuses] = useState<Record<string, ApplicationStatus>>({});
  const [joinEvent, setJoinEvent] = useState<FeedEvent | null>(null);
  const [joinPhase, setJoinPhase] = useState<"confirm" | "sending" | "done" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams({ category: slug, page: "0" });
    if (type) q.set("type", type);
    fetch(`/api/events?${q}`)
      .then((r) => r.json())
      .then((d) => setEvents(d.items ?? []))
      .catch(() => setEvents([]));
    if (type)
      fetch("/api/categories")
        .then((r) => r.json())
        .then((d) => {
          const t = (d.trainingTypes ?? []).find((x: TrainingType) => x.slug === type);
          if (t) setTitle(t.name);
        })
        .catch(() => {});
  }, [slug, type]);

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(null), 2800);
  }

  async function confirmJoin() {
    if (!joinEvent) return;
    setJoinPhase("sending");
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: joinEvent.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || data.error === "already_applied") {
        setStatuses((s) => ({ ...s, [joinEvent.id]: "pending" }));
        setJoinPhase(res.ok ? "done" : null);
        if (!res.ok) flash("Ты уже откликался на эту встречу.");
        return;
      }
      if (data.error === "event_full") say("Упс, мест уже нет. Посмотри другие встречи — их много 👇");
      flash(apiErrorText(data, "Не получилось отправить отклик.", res.status));
    } catch {
      flash("Проблема с соединением.");
    }
    setJoinPhase(null);
    setJoinEvent(null);
  }

  const icon = type ? trainingIcon(type) : CATEGORY_ICON[slug] ?? CATEGORY_ICON.custom;
  return (
    <Screen id="cat" anim="in">
      <div className="bar-top">
        <button className="rb gl" onClick={() => goBack(router, "/feed")} aria-label="Назад">
          <Ic n="back" />
        </button>
        <span />
      </div>
      <div className="cathead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" />
        <h1 className="t">{title}</h1>
      </div>
      <div className="list" style={{ marginTop: 14 }}>
        {events === null && [0, 1, 2].map((i) => <div key={i} className="sk" style={{ height: 76 }} />)}
        {events?.map((e) => (
          <RowCard
            key={e.id}
            e={e}
            status={statuses[e.id] ?? e.myApplicationStatus ?? null}
            onJoin={() => {
              setJoinEvent(e);
              setJoinPhase("confirm");
            }}
          />
        ))}
        {events?.length === 0 && (
          <div className="empty">
            <EmptyIll />
            <b>Пока пусто</b>
            <span>В этой категории сейчас нет встреч — создай свою, люди подтянутся.</span>
            <Link className="btn v" href={`/create?category=${slug}${type ? `&type=${type}` : ""}`} style={{ width: "100%", marginTop: 8 }}>
              Создать встречу
            </Link>
          </div>
        )}
      </div>
      <JoinFlow
        event={joinEvent}
        phase={joinPhase}
        onConfirm={confirmJoin}
        onClose={() => {
          setJoinPhase(null);
          setJoinEvent(null);
        }}
      />
      <Toast text={toast} />
    </Screen>
  );
}

function plural(n: number, a: string, b: string, c: string) {
  const m = n % 10;
  const h = n % 100;
  return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c;
}

function whenText(dateIso: string, time: string) {
  const d = new Date(dateIso);
  const t = new Date();
  const diff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86400000
  );
  const day = diff === 0 ? "сегодня" : diff === 1 ? "завтра" : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return `${day}, ${time.slice(0, 5)}`;
}

interface CityEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string | null;
  endDate: string | null;
  placeName: string | null;
  priceText: string | null;
  category: string;
  kind: string | null;
  photoUrl: string | null;
}

/** «17 окт · 19:00» или «до 25 ноя» для выставок, которые идут несколько дней. */
function cityWhen(c: CityEvent) {
  const today = new Date().toISOString().slice(0, 10);
  if (c.endDate && c.eventDate <= today) {
    const d = new Date(c.endDate);
    return `идёт · до ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "")}`;
  }
  return c.eventTime ? whenShort(c.eventDate, c.eventTime) : new Date(c.eventDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
}

function whenShort(dateIso: string, time: string) {
  const d = new Date(dateIso);
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "")} · ${time.slice(0, 5)}`;
}
