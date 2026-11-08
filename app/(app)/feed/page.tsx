"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useGuide } from "@/lib/mosya/guide";
import { say } from "@/lib/mosya/peek";
import { JoinFlow } from "@/components/events/JoinFlow";
import { CATEGORY_ICON, trainingIcon } from "@/lib/data/category-icons";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { interestIcon } from "@/lib/data/interests";
import { EmptyIll, Ic, RowCard, Screen, Sheet, Toast, type HeroEvent } from "@/components/proto/ui";
import { KI, KHc, TwoLine, bg, backgroundPhotoUrl } from "@/components/proto/k";
import { Creature } from "@/components/brand/Creature";
import type { ApplicationStatus } from "@/components/applications/ApplicationStatus";
import { goBack } from "@/lib/nav/back";
import { CityWheel } from "@/components/proto/pickers";
import { RUSSIAN_CITIES } from "@/lib/data/russian-cities";
import { KIND_LABEL } from "@/lib/city-events";
import { personDistanceLabel } from "@/lib/geo/approx-distance";
import { watchMyLocation, sendMyLocation } from "@/lib/geo/client-location";
import { usePeopleVisitSeed } from "@/lib/people/use-visit-seed";
import { rememberSelectedPerson } from "@/lib/people/selected-preview";

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
  return category ? <CategoryScreen key={`${category}:${type}:${sp.get("city")}`} slug={category} type={type} city={sp.get("city")} /> : <HomeScreen />;
}

// Short-lived display state within this document only; login/logout reload
// the document. Fresh API responses always replace it in the background.
interface HomeSnapshot {
  at: number; city: string | null; categories: Category[]; trainingTypes: TrainingType[];
  events: FeedEvent[]; biz: FeedEvent[]; cityEv: CityEvent[]; people: PersonCard[];
}
let homeSnapshot: HomeSnapshot | null = null;

/* ================= главная ================= */
function HomeScreen() {
  const router = useRouter();
  const [initial] = useState(() => homeSnapshot && Date.now() - homeSnapshot.at < 5 * 60_000 ? homeSnapshot : null);
  // One selection per visit: background GPS refreshes keep the rail stable.
  const peopleSeed = usePeopleVisitSeed();
  const peopleSeedRef = useRef(peopleSeed);
  peopleSeedRef.current = peopleSeed;
  const requestController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    requestController.current = controller;
    return () => controller.abort();
  }, []);
  const [city, setCity] = useState<string | null>(initial?.city ?? null);
  const [cityOpen, setCityOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>(initial?.categories ?? []);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>(initial?.trainingTypes ?? []);
  const [events, setEvents] = useState<FeedEvent[] | null>(initial?.events ?? null);
  const [biz, setBiz] = useState<FeedEvent[]>(initial?.biz ?? []);
  const [cityEv, setCityEv] = useState<CityEvent[]>(initial?.cityEv ?? []);
  const [people, setPeople] = useState<PersonCard[]>(initial?.people ?? []);
  // Есть ли у меня свежая примерная точка — иначе предлагаем «Показать, кто рядом».
  const [meHasLoc, setMeHasLoc] = useState(true);
  const [peopleLoaded, setPeopleLoaded] = useState(initial !== null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [plan, setPlan] = useState<{ ev: MyEvent; label: string } | null>(null);
  // Новая заявка на мою встречу — плашка вместо «Ты в деле» (главнее).
  const [req, setReq] = useState<{
    count: number;
    latest: { eventId: string; eventTitle: string; name: string; age: number | null; avatarUrl: string | null };
  } | null>(null);
  const [unreadNotif, setUnreadNotif] = useState(false);
  const [trainOpen, setTrainOpen] = useState(false);
  useGuide("feed", { when: events !== null });
  useEffect(() => {
    if (events) homeSnapshot = { at: Date.now(), city, categories, trainingTypes, events, biz, cityEv, people };
  }, [city, categories, trainingTypes, events, biz, cityEv, people]);

  // A new location request supersedes old results from the previous area.
  const peopleRequest = useRef<AbortController | null>(null);
  const cityRef = useRef<string | null>(city);
  cityRef.current = city;
  useEffect(() => () => peopleRequest.current?.abort(), []);
  const loadPeople = useCallback(() => {
    peopleRequest.current?.abort();
    const controller = new AbortController();
    peopleRequest.current = controller;
    if (!cityRef.current) return Promise.resolve();
    return fetch(`/api/people?city=${encodeURIComponent(cityRef.current)}&seed=${peopleSeedRef.current}`, { signal: controller.signal, cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("people_unavailable"); return r.json(); })
      .then((d) => {
        if (controller.signal.aborted) return;
        setPeopleLoaded(true);
        setPeople(Array.isArray(d.items) ? d.items : []);
        setMeHasLoc(d.meHasLocation !== false);
      })
      .catch(() => {});
  }, []);
  useEffect(() => { void loadPeople(); }, [peopleSeed, loadPeople]);
  const loadEvents = useCallback((c: string) => {
    return fetch(`/api/events?page=0&shuffle=1&city=${encodeURIComponent(c)}`, { signal: requestController.current?.signal })
      .then((r) => r.json())
      .then((d) => setEvents(d.items ?? []))
      .catch(() => setEvents((prev) => prev ?? []));
  }, []);

  useEffect(() => watchMyLocation(() => {
    loadPeople();
    if (cityRef.current) loadEvents(cityRef.current);
  }), [loadPeople, loadEvents]);

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
    fetch("/api/me/profile", { signal: requestController.current?.signal })
      .then((r) => r.json())
      .then((d) => setCity(d.city || "Тюмень"))
      .catch(() => setCity("Тюмень"));
    fetch("/api/categories", { signal: requestController.current?.signal })
      .then((r) => r.json())
      .then((d) => {
        setCategories(d.categories ?? []);
        setTrainingTypes(d.trainingTypes ?? []);
      })
      .catch(() => {});
    loadPeople();
    fetch("/api/notifications", { signal: requestController.current?.signal })
      .then((r) => r.json())
      .then((d) => setUnreadNotif((d.items ?? []).some((n: { isRead?: boolean }) => !n.isRead)))
      .catch(() => {});
    fetch("/api/me/pending-applications", { signal: requestController.current?.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d?.latest) setReq({ count: d.count ?? 1, latest: d.latest });
      })
      .catch(() => {});
    fetch("/api/me/events?scope=upcoming", { signal: requestController.current?.signal })
      .then((r) => r.json())
      .then((d) => {
        const mine = ((d.items ?? d.events ?? []) as MyEvent[]).filter((e) => e.role !== "organizer");
        if (mine[0]) setPlan({ ev: mine[0], label: "Ты в деле" });
      })
      .catch(() => {});
  }, [loadPeople]);

  useEffect(() => {
    if (!city) return;
    setPeople([]);
    setPeopleLoaded(false);
    loadPeople();
    loadEvents(city);
    fetch(`/api/events?business=true&city=${encodeURIComponent(city)}`, { signal: requestController.current?.signal })
      .then((r) => r.json())
      .then((d) => setBiz((d.items ?? []).filter((e: FeedEvent) => e.isBusiness)))
      .catch(() => {});
    fetch(`/api/city-events?city=${encodeURIComponent(city)}`, { signal: requestController.current?.signal })
      .then((r) => r.json())
      .then((d) => setCityEv(d.items ?? []))
      .catch(() => {});
  }, [city, loadEvents, loadPeople]);

  // Заявка «ждём ответа» тоже показывается плашкой сверху (если нет подтверждённой).
  useEffect(() => {
    if (plan || !events) return;
    const p = events.find((e) => e.myApplicationStatus === "pending");
    if (p) setPlan({ ev: { id: p.id, title: p.title, eventDate: p.eventDate, eventTime: p.eventTime, photoUrl: p.photoUrl ?? null, category: p.category, isBusiness: p.isBusiness }, label: "Заявка отправлена" });
  }, [events, plan]);

  function openCategory(c: Category, typeSlug?: string) {
    if (c.slug === "training" && !typeSlug) {
      setTrainOpen(true);
      return;
    }
    setTrainOpen(false);
    const q = new URLSearchParams({ category: c.slug });
    if (typeSlug) q.set("type", typeSlug);
    if (city) q.set("city", city);
    // Open immediately. The destination owns loading, empty and retry states;
    // waiting here made a slow network look like a missed tap.
    router.push(`/feed?${q}`);
  }

  // «Популярное сегодня»: сначала все продвинутые встречи города (и бизнес тоже) в порядке
  // с сервера, за ними — все обычные личные встречи (бизнес без продвижения — только в «Афише»).
  // «Популярное сегодня» — только встречи людей (продвинутые первыми);
  // все бизнес-события — в «Афише заведений» (тоже продвинутые первыми).
  const personal = (events ?? []).filter((e) => !e.isBusiness);
  const pop = [...personal.filter((e) => e.isPromoted), ...personal.filter((e) => !e.isPromoted)];
  const bizSorted = [...biz.filter((e) => e.isPromoted || e.isBoosted), ...biz.filter((e) => !(e.isPromoted || e.isBoosted))];
  const cats = categories.filter((c) => c.slug !== "custom");
  const training = categories.find((c) => c.slug === "training");

  // Карточки людей: мозаика прототипа — одна большая и две маленькие.
  const mosaic = people.slice(0, 3);
  const MZ = [
    { left: 0, top: 0, width: "calc(58% - 6px)", height: 268 },
    { right: 0, top: 0, width: "calc(42% - 6px)", height: 128 },
    { right: 0, top: 140, width: "calc(42% - 6px)", height: 128 },
  ];

  return (
    <Screen id="home">
      <div className="k-top">
        <button className="k-chip k-g k-pr" style={{ height: 40 }} onClick={() => setCityOpen(true)} data-city>
          <KI n="pin" />
          {city ?? "…"}
          <KI n="down" />
        </button>
        <Link className="k-rb k-g k-pr" href="/notifications" aria-label="Уведомления" style={{ position: "relative", overflow: "visible" }}>
          <KI n="bell" />
          {unreadNotif && <span className="k-dotn" />}
        </Link>
      </div>

      <h1 className="k-h1" style={{ marginTop: 20, fontSize: 38 }}>
        Найди <em>компанию</em>
        <br />
        на сегодня
      </h1>

      {/* Один ряд: лупа → «Все» → категории → «Фильтры». */}
      <div className="k-hs" style={{ marginTop: 14, gap: 8 }}>
        <Link className="k-chip k-g k-pr" style={{ padding: "0 11px" }} href="/search" aria-label="Поиск">
          <KI n="search" />
        </Link>
        <span className="k-chip k-g k-pr k-on">Все</span>
        {cats.map((c) => (
          <button key={c.id} className="k-chip k-pr k-g" onClick={() => openCategory(c)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CATEGORY_ICON[c.slug] ?? CATEGORY_ICON.custom} alt="" style={{ width: 22, height: 22, marginLeft: -4 }} />
            {SHORT[c.slug] ?? c.name}
          </button>
        ))}
        <Link className="k-chip k-g k-pr" href="/search?filters=1">
          <KI n="filter" />
          Фильтры
        </Link>
      </div>

      {/* Плашка с Мосей: новая заявка → «ты в деле» → кто свободен рядом. */}
      {req ? (
        <Link className="k-mos k-g k-pr" href={`/events/${req.latest.eventId}`} aria-label="Открыть новую заявку">
          <Creature size={58} variant="e" />
          <span className="k-t">
            <b>{`${req.latest.name}${req.latest.age ? `, ${req.latest.age}` : ""}`}</b> хочет на «{req.latest.eventTitle}»
            {req.count > 1 ? ` · ещё ${req.count - 1}` : ""}
          </span>
          <span className="k-go">Открыть</span>
        </Link>
      ) : plan ? (
        <Link className="k-mos k-g k-pr" href={`/events/${plan.ev.id}`}>
          <Creature size={58} variant="e" />
          <span className="k-t">
            <b>{plan.label}</b> · {plan.ev.title}, {whenText(plan.ev.eventDate, plan.ev.eventTime)}
          </span>
          <span className="k-go">Открыть</span>
        </Link>
      ) : (
        <Link className="k-mos k-g k-pr" href={city ? `/people?city=${encodeURIComponent(city)}` : "/people"}>
          <Creature size={58} variant="e" />
          <span className="k-t">
            {people.length > 0 ? (
              <>
                <b>
                  {people.length} {plural(people.length, "человек", "человека", "человек")}
                </b>{" "}
                рядом {people.length === 1 ? "свободен" : "свободны"} сегодня вечером
              </>
            ) : (
              <>
                <b>Найди компанию</b> — посмотри, кто рядом
              </>
            )}
          </span>
          <span className="k-go">Найти</span>
        </Link>
      )}

      <div className="k-sec">
        <div>
          <h3>
            Личные <em>встречи</em>
          </h3>
          <p>Планы людей рядом — присоединяйся</p>
        </div>
        <Link className="k-all k-g k-pr" href="/search">
          Все
        </Link>
      </div>
      <div className="k-hs">
        {events === null
          ? [0, 1, 2].map((i) => <div key={i} className="k-hc k-sk" />)
          : pop.map((e) => <KHc key={e.id} e={e} />)}
        {events !== null && pop.length === 0 && (
          <Link href="/create" className="k-inv k-g k-pr">
            <i>+</i>Сегодня пока тихо — создай первую встречу
          </Link>
        )}
      </div>

      <div className="k-sec">
        <div>
          <h3>
            Люди <em>в твоём городе</em>
          </h3>
          <p>С общими интересами</p>
        </div>
        <Link className="k-all k-g k-pr" href={city ? `/people?city=${encodeURIComponent(city)}` : "/people"}>
          Листать
        </Link>
      </div>
      {!meHasLoc && (
        <button className="k-mos k-g k-pr" onClick={allowGeo} disabled={geoBusy}>
          <span className="k-rb k-rbd" style={{ marginLeft: 8 }}>
            <KI n="pin" />
          </span>
          <span className="k-t">
            <b>{geoBusy ? "Ищем, кто рядом…" : "Показать, кто рядом"}</b> — точный адрес никто не узнает
          </span>
        </button>
      )}
      {peopleLoaded && people.length === 0 && (
        <p className="k-muted" style={{ margin: "12px 0 0", font: "400 14px/1.45 var(--disp)" }}>
          Пока нет анкет в выбранном городе. Можно сменить город или создать встречу.
        </p>
      )}
      {mosaic.length > 0 && (
        <div className="k-mz" style={mosaic.length < 3 ? { height: mosaic.length === 1 ? 268 : 268 } : undefined}>
          {mosaic.map((q, i) => (
            <Link
              key={q.id}
              className="k-mt k-pr"
              onClick={() => rememberSelectedPerson({ ...q, avatarUrl: backgroundPhotoUrl(q.avatarUrl, 640) })}
              href={`/people?start=${q.id}${city ? `&city=${encodeURIComponent(city)}` : ""}`}
              style={{ ...MZ[mosaic.length === 1 ? 0 : i], ...(mosaic.length === 1 ? { width: "100%" } : mosaic.length === 2 && i === 1 ? { height: 268 } : {}), ...bg(q.avatarUrl, 640, "center 30%") }}
            >
              {q.sharedCount > 0 && (
                <span className="k-cm k-gw">
                  {q.sharedInterests.slice(0, 2).map((n) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={n} src={interestIcon(n)} alt="" style={{ width: 18, height: 18 }} />
                  ))}
                  {q.sharedCount} общ.
                </span>
              )}
              <span className="k-mb">
                <b>
                  {q.name}, {q.age}
                </b>
                <small>{q.distanceM != null ? personDistanceLabel(q.distanceM) : city}</small>
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="k-biz k-g">
        <div className="k-sec">
          <div>
            <h3>
              Афиша <em>заведений</em>
            </h3>
            <p>События кафе, баров и площадок</p>
          </div>
          <Link className="k-all k-g k-pr" href="/business">
            Все
          </Link>
        </div>
        <div className="k-hs">
          {bizSorted.map((e) => (
            <KHc key={e.id} e={e} />
          ))}
          {/* «Что ещё в городе»: события из открытых источников (после одобрения). */}
          {cityEv.map((c) => (
            <Link key={c.id} className="k-hc k-pr" href={`/city/${c.id}`} style={bg(c.photoUrl, 600)}>
              <span className="k-chip k-gw k-tg">{KIND_LABEL[c.kind ?? ""] ?? "В городе"}</span>
              <span className="k-bt">
                <span className="k-tt">
                  <TwoLine text={c.title} />
                </span>
                <span className="k-mm" style={{ display: "block" }}>
                  {[cityWhen(c), c.placeName].filter(Boolean).join(" · ")}
                </span>
                <span className="k-cta">{c.priceText || "Подробнее"}</span>
              </span>
            </Link>
          ))}
          {/* Пока событий мало — приглашаем заведения разместить своё. */}
          {(
            <Link className="k-inv k-g k-pr" href="/create?business=true">
              <i>+</i>Здесь может быть ваше бизнес‑событие
            </Link>
          )}
        </div>
      </div>

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

/* ================= экран категории ================= */
function CategoryScreen({ slug, type, city }: { slug: string; type: string | null; city: string | null }) {
  const router = useRouter();
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [title, setTitle] = useState(SHORT[slug] ?? "");
  const [statuses, setStatuses] = useState<Record<string, ApplicationStatus>>({});
  const [joinEvent, setJoinEvent] = useState<FeedEvent | null>(null);
  const [joinPhase, setJoinPhase] = useState<"confirm" | "sending" | "done" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setEvents(null);
    setLoadError(false);
    setTitle(SHORT[slug] ?? "Встречи");
    const q = new URLSearchParams({ category: slug, page: "0" });
    if (type) q.set("type", type);
    if (city) q.set("city", city);
    fetch(`/api/events?${q}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error("events_unavailable"); return r.json(); })
      .then((d) => { if (!controller.signal.aborted) setEvents(d.items ?? []); })
      .catch(() => { if (!controller.signal.aborted) { setLoadError(true); setEvents(null); } });
    if (type)
      fetch("/api/categories", { signal: controller.signal })
        .then((r) => r.json())
        .then((d) => {
          const t = (d.trainingTypes ?? []).find((x: TrainingType) => x.slug === type);
          if (t && !controller.signal.aborted) setTitle(t.name);
        })
        .catch(() => {});
    return () => controller.abort();
  }, [slug, type, city, attempt]);

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
        {loadError && <div className="empty" role="status">
          <b>Не удалось загрузить встречи.</b>
          <button className="btn o" onClick={() => setAttempt(n => n + 1)}>Попробовать снова</button>
        </div>}
        {events === null && !loadError && [0, 1, 2].map((i) => <div key={i} className="sk" style={{ height: 76 }} />)}
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
