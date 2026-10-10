"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LocationPicker } from "@/components/map/LocationPicker";
import { searchAddress, type AddressSuggestion } from "@/lib/maps/forward-geocode";
import { getInitData } from "@/lib/telegram/webapp-client";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { CATEGORY_ICON, trainingIcon } from "@/lib/data/category-icons";
import { showGuide } from "@/lib/mosya/guide";
import { confetti } from "@/lib/mosya/confetti";
import { peek, say } from "@/lib/mosya/peek";
import { Chr, Cover, HeroCard, Ic, Toast } from "@/components/proto/ui";
import { CalendarSheet, Wheel } from "@/components/proto/pickers";
import { ShareSheet } from "@/components/proto/ShareSheet";
import { mosyaSrc } from "@/components/brand/Mosya";
import { PhotoCropModal } from "./PhotoCropModal";

/**
 * Создание встречи в 4 шага — разметка и анимации из прототипа (SCR.create):
 *   1. Что планируем — 8 категорий, вид тренировки, «Своё предложение»
 *   2. Название и обложка — обложки рисует Мося, можно своё фото
 *   3. Когда и где — колёса дня и времени, календарь, длительность, место
 *   4. Кто и сколько — люди, расходы, открыто/анонимно, превью карточки
 * Потом — «Встреча опубликована» и «Поделиться». На сервер уходят те же
 * поля, что и раньше (POST /api/events).
 */

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
interface PlaceSuggestion {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  source: "yandex" | "osm" | "history";
}
type CostType = "each_pays" | "organizer_treats" | "free" | "negotiable";

const COSTS: [CostType, string][] = [
  ["each_pays", "Каждый за себя"],
  ["organizer_treats", "Автор угощает"],
  ["free", "Без расходов"],
  ["negotiable", "По договорённости"],
];
const DURS: [number, string][] = [
  [60, "1 ч"],
  [90, "1,5 ч"],
  [120, "2 ч"],
  [180, "3 ч"],
  [240, "4 ч"],
];
/** Подписи плиток — как в прототипе. */
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

const N_DAYS = 120;
const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WDL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MS = ["янв", "февр", "марта", "апр", "мая", "июня", "июля", "авг", "сент", "окт", "нояб", "дек"];
const MG = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const pad2 = (n: number) => String(n).padStart(2, "0");

function dayDate(i: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + i);
  return d;
}
const DAYS = Array.from({ length: N_DAYS }, (_, i) => {
  const d = dayDate(i);
  const wd = WDL[d.getDay()] ?? "";
  return {
    iso: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    s: i === 0 ? "Сегодня" : i === 1 ? "Завтра" : `${WD[d.getDay()]}, ${d.getDate()} ${MS[d.getMonth()]}`,
    l: i === 0 ? `Сегодня, ${d.getDate()} ${MG[d.getMonth()]}` : i === 1 ? `Завтра, ${d.getDate()} ${MG[d.getMonth()]}` : `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${d.getDate()} ${MG[d.getMonth()]}`,
    chip: i === 0 ? "Сегодня" : i === 1 ? "Завтра" : `${WD[d.getDay()]}, ${d.getDate()}`,
  };
});
const HOURS = Array.from({ length: 24 }, (_, h) => String(h));
const MINS = Array.from({ length: 12 }, (_, m) => pad2(m * 5));

/** Быстрые дни: сегодня, завтра и ближайшие пятница и суббота. */
const QUICK_DAYS = (() => {
  const out = [0, 1];
  for (let i = 2; i < 9 && out.length < 4; i++) {
    const wd = dayDate(i).getDay();
    if (wd === 5 || wd === 6) out.push(i);
  }
  return out;
})();

export function CreateMeetingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [me, setMe] = useState<{ name: string; avatarUrl: string | null } | null>(null);

  const [categorySlug, setCategorySlug] = useState<string | null>(searchParams.get("category"));
  const [trainingTypeSlug, setTrainingTypeSlug] = useState<string | null>(searchParams.get("type"));
  const [own, setOwn] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [ownPhoto, setOwnPhoto] = useState<string | undefined>();
  const [covers, setCovers] = useState<string[]>([]);
  const [coverShift, setCoverShift] = useState(0);
  const [cropSrc, setCropSrc] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  const [di, setDi] = useState(0);
  const [hh, setHh] = useState(() => Math.min(23, new Date().getHours() + 1));
  const [mi, setMi] = useState(0);
  const [calOpen, setCalOpen] = useState(false);
  const [duration, setDuration] = useState(120);
  const [durOwn, setDurOwn] = useState(false);
  const [placeName, setPlaceName] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [externalCoords, setExternalCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [recs, setRecs] = useState<PlaceSuggestion[]>([]);
  const [drop, setDrop] = useState<PlaceSuggestion[]>([]);
  const [addrDrop, setAddrDrop] = useState<AddressSuggestion[]>([]);

  const [seatsTotal, setSeatsTotal] = useState(3);
  const [costType, setCostType] = useState<CostType>("each_pays");
  const [isAnonymous, setIsAnonymous] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories ?? []);
        setTrainingTypes(data.trainingTypes ?? []);
      })
      .catch(() => {});
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((d) => setMe({ name: d.name ?? "Ты", avatarUrl: d.avatarUrl ?? null }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (step === 1) showGuide("create", { low: true });
    if (step === 2) showGuide("cover", { low: true });
    if (step === 3) showGuide("when", { low: true });
  }, [step]);

  const isOwn = categorySlug === "custom";
  const iconSrc =
    categorySlug === "training" ? trainingIcon(trainingTypeSlug) : isOwn ? "/brand/cat3d/i_games.webp" : (categorySlug && CATEGORY_ICON[categorySlug]) || CATEGORY_ICON.custom || "";
  const catLabel =
    categorySlug === "training"
      ? trainingTypes.find((t) => t.slug === trainingTypeSlug)?.name ?? "Тренировка"
      : isOwn
        ? own || "Своё"
        : (categorySlug && SHORT[categorySlug]) || "встречи";

  // Обложки от Моси — перерисовываются при смене категории и «Ещё варианты».
  useEffect(() => {
    if (step !== 2 || !iconSrc) return;
    let cancelled = false;
    setCovers([]);
    drawCovers(iconSrc, coverShift).then((list) => {
      if (cancelled) return;
      setCovers(list);
      if (!photo || photo !== ownPhoto) setPhoto(list[0]);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, iconSrc, coverShift]);

  // «Мося рекомендует» — места под категорию (кинотеатры для «Кино»…).
  useEffect(() => {
    if (step !== 3) return;
    const p = new URLSearchParams();
    if (categorySlug) p.set("category", categorySlug);
    if (trainingTypeSlug) p.set("type", trainingTypeSlug);
    fetch(`/api/places?${p}`)
      .then((r) => r.json())
      .then((d) => setRecs(Array.isArray(d.items) ? d.items.slice(0, 4) : []))
      .catch(() => setRecs([]));
  }, [step, categorySlug, trainingTypeSlug]);

  // Поиск по набранному: места (подсказки) + адреса (геокодер).
  useEffect(() => {
    const q = placeQuery.trim();
    if (q.length < 2) {
      setDrop([]);
      setAddrDrop([]);
      return;
    }
    const t = setTimeout(() => {
      const p = new URLSearchParams({ q });
      if (categorySlug) p.set("category", categorySlug);
      fetch(`/api/places?${p}`)
        .then((r) => r.json())
        .then((d) => setDrop(Array.isArray(d.items) ? d.items.slice(0, 4) : []))
        .catch(() => setDrop([]));
      if (q.length >= 3) searchAddress(q).then((a) => setAddrDrop(a.slice(0, 3)));
    }, 300);
    return () => clearTimeout(t);
  }, [placeQuery, categorySlug]);

  function pickPlace(p: { name: string; address: string; latitude: number; longitude: number }) {
    setPlaceName(p.name);
    setAddress(p.address);
    setLatitude(p.latitude);
    setLongitude(p.longitude);
    setExternalCoords({ latitude: p.latitude, longitude: p.longitude });
    setPlaceQuery("");
    setDrop([]);
    setAddrDrop([]);
  }

  function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  const eventDate = DAYS[di]?.iso ?? DAYS[0]!.iso;
  const eventTime = `${pad2(hh)}:${pad2(mi * 5)}`;
  const endMin = (hh * 60 + mi * 5 + duration) % 1440;
  const eventEndTime = `${pad2(Math.floor(endMin / 60))}:${pad2(endMin % 60)}`;
  const sumTxt = `${DAYS[di]?.l}, ${hh}:${pad2(mi * 5)}–${Math.floor(endMin / 60)}:${pad2(endMin % 60)}`;

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  }

  function problem(): string | null {
    if (step === 1) {
      if (!categorySlug) return "Выбери, что планируешь.";
      if (categorySlug === "training" && !trainingTypeSlug) return "Выбери вид тренировки.";
      if (isOwn && own.trim().length < 2) return "Напиши одним-двумя словами, чем займёмся — например «сапы». Так встречу найдут поиском";
    }
    if (step === 2 && title.trim().length < 3) return "Придумай название — хотя бы 3 буквы.";
    if (step === 3) {
      if (duration < 60) return "Встреча должна длиться хотя бы час.";
      if (placeName.trim().length < 2 || latitude === undefined || longitude === undefined) return "Выбери место из подсказок или отметь точку на карте.";
    }
    if (step === 4 && seatsTotal < 1) return "Нужен хотя бы 1 человек кроме тебя.";
    return null;
  }

  function next() {
    const h = problem();
    if (h) {
      say(h, "think");
      return;
    }
    if (step === 1 && isOwn && !title) setTitle(own.trim());
    if (step < 4) {
      setDir(1);
      setStep(step + 1);
    } else publish();
  }
  function back() {
    if (step > 1) {
      setDir(-1);
      setStep(step - 1);
    } else router.back();
  }

  async function publish() {
    setSubmitting(true);
    if (!getInitData()) {
      flash("Открой приложение через Telegram.");
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categorySlug,
          trainingTypeSlug: trainingTypeSlug ?? undefined,
          placeName,
          address,
          latitude,
          longitude,
          eventDate,
          eventTime,
          eventEndTime,
          seatsTotal,
          costType,
          title: title.trim(),
          description: [isOwn && own.trim() && !title.toLowerCase().includes(own.trim().toLowerCase()) ? own.trim() : "", description]
            .filter(Boolean)
            .join(". "),
          isBusiness: false,
          isAnonymous,
          photoBase64: photo,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const map: Record<string, number> = {
          categorySlug: 1,
          trainingTypeSlug: 1,
          title: 2,
          description: 2,
          photoBase64: 2,
          placeName: 3,
          address: 3,
          latitude: 3,
          longitude: 3,
          eventDate: 3,
          eventTime: 3,
          eventEndTime: 3,
        };
        const target = typeof data.field === "string" ? map[data.field] : undefined;
        if (target) {
          setDir(-1);
          setStep(target);
        }
        say(apiErrorText(data, "Не получилось опубликовать встречу. Попробуй ещё раз.", res.status), "think");
        setSubmitting(false);
        return;
      }
      confetti();
      setPublishedId(data.eventId as string);
      setTimeout(() => peek({ pose: "jump", text: "Готово! Заявки придут в Telegram — ты сам решаешь, кого принять", quick: true }), 900);
    } catch {
      flash("Проблема с соединением.");
      setSubmitting(false);
    }
  }

  const preview = useMemo(
    () => ({
      id: "preview",
      title: title || own || "Моя встреча",
      eventDate,
      eventTime,
      placeName: isAnonymous ? null : placeName || null,
      organizerHidden: isAnonymous,
      seatsTotal,
      seatsTaken: 0,
      photoUrl: photo ?? null,
      isAnonymous,
      costType,
      category: categorySlug ? { slug: categorySlug } : null,
      trainingType: trainingTypeSlug ? { slug: trainingTypeSlug } : null,
      goingPreview: [],
    }),
    [title, own, eventDate, eventTime, isAnonymous, placeName, seatsTotal, photo, costType, categorySlug, trainingTypeSlug]
  );

  /* ---------- опубликовано ---------- */
  if (publishedId) {
    return (
      <section className="scr aurora up" data-id="published">
        <div className="scroll" style={{ paddingBottom: 180 }}>
          <div className="done">
            <div className="burst">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mosyaSrc("wave")} alt="" />
            </div>
            <h1 className="t">
              Встреча <em>опубликована</em>
            </h1>
            <p>
              {isAnonymous
                ? "Встреча анонимная: имя, фото и адрес увидят только те, кого ты примешь."
                : `${photo !== ownPhoto ? "Обложку нарисовал Мося — поменять можно в редактировании. " : ""}Её уже видят люди рядом. Заявки придут сюда и в Telegram — ты сам решаешь, кого принять.`}
            </p>
          </div>
        </div>
        <div className="foot">
          <button className="btn v" onClick={() => setShareOpen(true)}>
            <Ic n="share" />
            Поделиться ссылкой
          </button>
          <button className="btn o" onClick={() => router.push("/my-events")}>
            Мои встречи
          </button>
        </div>
        <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} eventId={publishedId} title={title} when={sumTxt} />
      </section>
    );
  }

  const cats = categories.filter((c) => c.slug !== "custom");
  const hasCustom = categories.some((c) => c.slug === "custom");

  return (
    <section className="scr cr aurora up" data-id="create">
      <div className="scroll" style={{ paddingBottom: 160 }}>
        <div className="head">
          <button className="rb gl" onClick={back} aria-label={step > 1 ? "Назад" : "Закрыть"}>
            <Ic n={step > 1 ? "back" : "close"} />
          </button>
          <span className="prog">
            {[1, 2, 3, 4].map((i) => (
              <i key={i} className={i <= step ? "on" : ""} />
            ))}
          </span>
          <span style={{ minWidth: 44, textAlign: "right", color: "var(--grey)", fontSize: 13 }}>{step}/4</span>
        </div>

        <div key={step} className="crstep" style={{ ["--dir" as string]: dir } as React.CSSProperties}>
          {step === 1 && (
            <>
              <h1 className="t">
                Что <em>планируем</em>?
              </h1>
              <p className="sub">Выбери, во что будет встреча. Так её найдут люди с похожими интересами.</p>
              <div className="grid4">
                {cats.map((c) => (
                  <button
                    key={c.id}
                    className={`it gl ${categorySlug === c.slug ? "sel" : ""}`}
                    onClick={() => {
                      setCategorySlug(c.slug);
                      if (c.slug !== "training") setTrainingTypeSlug(null);
                    }}
                  >
                    <span className="ck">
                      <Ic n="check" />
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={CATEGORY_ICON[c.slug] ?? CATEGORY_ICON.custom} alt="" />
                    {SHORT[c.slug] ?? c.name}
                  </button>
                ))}
              </div>
              {hasCustom && (
                <button
                  className={`ownw gl ${isOwn ? "sel" : ""}`}
                  onClick={() => {
                    setCategorySlug("custom");
                    setTrainingTypeSlug(null);
                  }}
                >
                  <span className="ck">
                    <Ic n="check" />
                  </span>
                  <span className="spinstar">
                    <Chr shape="star" pal="peach" face="sly" />
                  </span>
                  <div>
                    <b>Своё предложение</b>
                    <span>Не нашёл подходящего? Придумай сам — от сапов до вязания</span>
                  </div>
                </button>
              )}
              {categorySlug === "training" && (
                <div>
                  <span className="lbl">Какая тренировка?</span>
                  <div className="cats" style={{ flexWrap: "wrap", margin: 0, padding: 0 }}>
                    {trainingTypes.map((t) => (
                      <button key={t.id} className={`cat ${trainingTypeSlug === t.slug ? "on" : "gl"}`} onClick={() => setTrainingTypeSlug(t.slug)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={trainingIcon(t.slug)} alt="" />
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {isOwn && (
                <div className="ownbox">
                  <span className="lbl">Чем займёмся?</span>
                  <label className="field gl">
                    <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Например: сапы, вязание, бадминтон" maxLength={30} />
                  </label>
                  <p className="muted" style={{ fontSize: 13, margin: "8px 2px 0", lineHeight: 1.45 }}>
                    Встреча попадёт в раздел «Другое», а люди найдут её поиском по этому слову.
                  </p>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="t">
                Название <em>и обложка</em>
              </h1>
              <p className="sub">Короткое название и картинка решают, придут ли люди.</p>
              <span className="lbl">Название</span>
              <label className="field gl">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, кофе перед работой" maxLength={100} />
              </label>
              <div className="aihead">
                <span className="lbl" style={{ margin: 0 }}>
                  Обложка
                </span>
                <span className={`aitag ${covers.length ? "" : "run"}`}>{covers.length ? (title.trim() ? `✦ Нарисовано под «${title.trim()}»` : "✦ Мося нарисовал") : "✦ Мося рисует…"}</span>
              </div>
              <div className="covers">
                {covers.length === 0
                  ? [0, 1, 2].map((i) => <div key={i} className="sk" style={{ aspectRatio: "1", borderRadius: 18 }} />)
                  : covers.map((c, i) => (
                      <button key={c.slice(-40) + i} className={`aic ${photo === c ? "on" : ""}`} style={{ animationDelay: `${i * 0.08}s` }} onClick={() => setPhoto(c)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="cv" src={c} alt={`Обложка ${i + 1}`} />
                        <span className="aib">✦ Мося</span>
                      </button>
                    ))}
              </div>
              <div className="covers" style={{ marginTop: 8 }}>
                <button className="up gl" onClick={() => fileRef.current?.click()}>
                  <Ic n="camera" />
                  Своё фото
                </button>
                {ownPhoto && (
                  <button className={photo === ownPhoto ? "on" : ""} onClick={() => setPhoto(ownPhoto)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ownPhoto} alt="" />
                  </button>
                )}
                <button className="up gl" onClick={() => setCoverShift((s) => s + 1)}>
                  ↻<br />
                  Ещё варианты
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhoto} />
              <p className="muted" style={{ fontSize: 13, margin: "10px 2px 0", lineHeight: 1.45 }}>
                Фото можно загрузить к любой встрече. Не загрузишь — Мося нарисует обложку сам, у каждой встречи будет картинка.
              </p>
              <span className="lbl">
                Описание <small className="muted">необязательно</small>
              </span>
              <label className="field gl ta">
                <textarea rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Что будем делать, как узнать друг друга" />
              </label>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="t">
                Когда <em>и где</em>?
              </h1>
              <p className="sub">Покрути день и время, как будильник на айфоне, или открой календарь.</p>
              <div className="whsum gl">
                <div>
                  <small>Встреча</small>
                  <b>{sumTxt}</b>
                </div>
                <button className="sm" onClick={() => setCalOpen(true)}>
                  <Ic n="cal" c="xs" /> Календарь
                </button>
              </div>
              <div className="chs nw" style={{ marginTop: 10 }}>
                {QUICK_DAYS.map((i) => (
                  <button key={i} className={di === i ? "on" : "gl"} onClick={() => setDi(i)}>
                    {DAYS[i]?.chip}
                  </button>
                ))}
              </div>
              <div className="wheels gl">
                <Wheel cls="d" items={DAYS.map((d) => d.s)} index={di} onChange={setDi} />
                <Wheel items={HOURS} index={hh} onChange={setHh} />
                <span className="colon">:</span>
                <Wheel items={MINS} index={mi} onChange={setMi} />
              </div>
              <span className="lbl">Сколько продлится</span>
              <div className="chs nw">
                {DURS.map(([v, t]) => (
                  <button
                    key={v}
                    className={duration === v && !durOwn ? "on" : "gl"}
                    onClick={() => {
                      setDuration(v);
                      setDurOwn(false);
                    }}
                  >
                    {t}
                  </button>
                ))}
                <button className={durOwn ? "on" : "gl"} onClick={() => setDurOwn(true)}>
                  Своё
                </button>
              </div>
              {durOwn && (
                <div>
                  <div className="durrow">
                    <label className="field gl">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={23}
                        value={Math.floor(duration / 60)}
                        onChange={(e) => setDuration(Math.max(0, Math.min(23, Number(e.target.value || 0))) * 60 + (duration % 60))}
                      />
                      <span>ч</span>
                    </label>
                    <label className="field gl">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={55}
                        step={5}
                        value={duration % 60}
                        onChange={(e) => setDuration(Math.floor(duration / 60) * 60 + Math.max(0, Math.min(55, Number(e.target.value || 0))))}
                      />
                      <span>мин</span>
                    </label>
                  </div>
                  <p className="hint2">Минимум 1 час. Окончание может быть на следующий день.</p>
                </div>
              )}

              <span className="lbl">Место</span>
              <label className="sfield gl plin" style={{ cursor: "text", height: 48 }}>
                <Ic n="search" c="s" />
                <input
                  value={placeQuery}
                  onChange={(e) => setPlaceQuery(e.target.value)}
                  placeholder="Название места или адрес"
                  style={{ flex: 1, border: 0, background: "none", font: "inherit", fontSize: 15, outline: "none", color: "var(--ink)", minWidth: 0 }}
                />
              </label>
              {placeQuery.trim().length >= 2 && (
                <div className="pldrop gl">
                  {drop.map((p) => (
                    <button key={"p" + p.name + p.address} onClick={() => pickPlace(p)}>
                      <Ic n="pin" c="s" />
                      <div>
                        <b>{p.name}</b>
                        <span>{p.address}</span>
                      </div>
                    </button>
                  ))}
                  {addrDrop.map((a) => (
                    <button key={"a" + a.address} onClick={() => pickPlace({ name: placeQuery.trim(), address: a.address, latitude: a.latitude, longitude: a.longitude })}>
                      <Ic n="nav" c="s" />
                      <div>
                        <b>{a.address.split(",")[0]}</b>
                        <span>{a.address}</span>
                      </div>
                    </button>
                  ))}
                  {drop.length === 0 && addrDrop.length === 0 && <div className="pln">Ищем… или нажми на карту — адрес определится сам</div>}
                </div>
              )}
              {recs.length > 0 && (
                <>
                  <div className="aihead" style={{ margin: "10px 0 6px" }}>
                    <span className="aitag">✦ Мося рекомендует для «{catLabel}»</span>
                  </div>
                  <div className="plrec">
                    {recs.map((p) => (
                      <button key={p.name} className={`plr gl ${placeName === p.name ? "on" : ""}`} onClick={() => pickPlace(p)}>
                        <b>{p.name}</b>
                        <span>{p.address || "отметим на карте"}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="pmap">
                <LocationPicker
                  onPick={({ latitude: la, longitude: lo }) => {
                    setLatitude(la);
                    setLongitude(lo);
                    if (!placeName) setPlaceName("Точка на карте");
                  }}
                  onAddressResolved={(resolved) => setAddress(resolved)}
                  externalCoords={externalCoords}
                  heightPx={300}
                />
                {latitude === undefined && <span className="phint">Нажми на карту — адрес определится сам</span>}
                {placeName && (
                  <div className="lab gl">
                    <div>
                      <b style={{ fontWeight: 500 }}>{placeName}</b>
                      <br />
                      <span className="muted">{address}</span>
                    </div>
                    <button className="sm" onClick={() => navigator.clipboard?.writeText(address).then(() => flash("Адрес скопирован"), () => {})} aria-label="Скопировать адрес">
                      <Ic n="copy" c="xs" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h1 className="t">
                Кто <em>и сколько</em>?
              </h1>
              <p className="sub">Все приходят по заявке — ты сам решаешь, кого принять.</p>
              <span className="lbl">Сколько человек ищешь</span>
              <div className="stepper">
                <button className="gl" onClick={() => setSeatsTotal((n) => Math.max(1, n - 1))} aria-label="Меньше">
                  −
                </button>
                <input
                  key={seatsTotal}
                  className="numin gl bump"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={30}
                  value={seatsTotal}
                  onChange={(e) => setSeatsTotal(Math.max(1, Math.min(30, Number(e.target.value || 1))))}
                  aria-label="Количество человек"
                />
                <button className="gl" onClick={() => setSeatsTotal((n) => Math.min(30, n + 1))} aria-label="Больше">
                  +
                </button>
              </div>
              <p className="hint2">
                Не считая тебя. На встрече будет: ты + {seatsTotal} = {seatsTotal + 1} чел.
                {seatsTotal > 4 && (
                  <>
                    {" "}
                    <a onClick={() => router.push("/subscriptions")}>На «Старт» — до 4, больше на «Медиум»</a>
                  </>
                )}
              </p>
              <span className="lbl">Как насчёт расходов?</span>
              <div className="costs">
                {COSTS.map(([v, t]) => (
                  <button key={v} className={`opt gl ${costType === v ? "on" : ""}`} onClick={() => setCostType(v)}>
                    <span className="radio" />
                    <b>{t}</b>
                  </button>
                ))}
              </div>
              <span className="lbl">Как публикуем?</span>
              <div style={{ display: "grid", gap: 8 }}>
                <button className={`opt gl ${!isAnonymous ? "on" : ""}`} onClick={() => setIsAnonymous(false)}>
                  <span className="radio" />
                  <div className="d">
                    <b>Открыто</b>
                    <span>Все видят твой профиль и место встречи</span>
                  </div>
                </button>
                <button className={`opt gl ${isAnonymous ? "on" : ""}`} onClick={() => setIsAnonymous(true)}>
                  <span className="radio" />
                  <div className="d">
                    <b>Анонимно</b>
                    <span>Имя, фото и точный адрес увидят только те, чью заявку ты одобришь</span>
                  </div>
                </button>
              </div>
              <span className="lbl">Так увидят другие</span>
              <div className="pvbox gl">
                <div className="pvr">
                  <Cover photoUrl={photo} icon={iconSrc} cls="th" />
                  <div>
                    <b>{title || own || "Моя встреча"}</b>
                    <span>
                      {DAYS[di]?.s.toLowerCase()}, {hh}:{pad2(mi * 5)} · {isAnonymous ? "анонимно · место после одобрения" : placeName}
                    </span>
                    <span className="pvorg">
                      {isAnonymous ? (
                        <span className="pvav">
                          <Chr shape="ball" pal="lilac" face="hidden" />
                        </span>
                      ) : (
                        <span className="pvav me">
                          {me?.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={me.avatarUrl} alt="" />
                          ) : (
                            (me?.name ?? "Я").charAt(0)
                          )}
                        </span>
                      )}
                      {isAnonymous ? "Организатор скрыт" : `${me?.name ?? "Ты"} · организатор`}
                    </span>
                  </div>
                </div>
                <div className="pvmap">
                  <div className="pvpin">
                    <span className="pw">
                      {isAnonymous ? (
                        <Chr shape="ball" pal="lilac" face="hidden" />
                      ) : (
                        <span className="pvme">
                          {me?.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={me.avatarUrl} alt="" />
                          ) : (
                            (me?.name ?? "Я").charAt(0)
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                  <span>На карте {isAnonymous ? "вместо фото — персонаж, точный адрес скрыт" : "— твоё фото на метке"}</span>
                </div>
              </div>
              <div style={{ pointerEvents: "none" }}>
                <HeroCard e={preview} full />
              </div>
            </>
          )}
        </div>
      </div>
      <div className="foot">
        <button className={`btn ${step === 4 ? "v" : "k"}`} onClick={next} disabled={submitting}>
          {step === 4 ? (submitting ? "Публикуем…" : "Опубликовать") : "Дальше"}
        </button>
      </div>

      <CalendarSheet open={calOpen} onClose={() => setCalOpen(false)} dayIndex={di} maxDays={N_DAYS} onPick={(i) => setDi(i)} />
      <Toast text={toast} />
      {cropSrc && (
        <PhotoCropModal
          src={cropSrc}
          aspectRatio={1.4}
          onCancel={() => setCropSrc(undefined)}
          onConfirm={(dataUrl) => {
            setOwnPhoto(dataUrl);
            setPhoto(dataUrl);
            setCropSrc(undefined);
          }}
        />
      )}
    </section>
  );
}

/**
 * Обложки, которые «рисует Мося»: фон в фирменной гамме (пастельный, как
 * .gfx прототипа, и два насыщенных градиента) + большая глянцевая
 * 3D-иконка категории. Рисуем в canvas и отдаём JPEG — дальше обложка
 * загружается как обычное фото встречи. shift — «Ещё варианты».
 */
type Bg = { kind: "pastel" } | { kind: "grad"; stops: [string, string, string] };
const BGS: Bg[] = [
  { kind: "pastel" },
  { kind: "grad", stops: ["#6C3BFF", "#A24DFF", "#FF6FA0"] },
  { kind: "grad", stops: ["#3A2F8F", "#6C3BFF", "#5AA9FF"] },
  { kind: "grad", stops: ["#A24DFF", "#FF6FA0", "#FFB27A"] },
  { kind: "grad", stops: ["#1A1230", "#5B3AA8", "#C871B6"] },
];

async function drawCovers(iconSrc: string, shift = 0): Promise<string[]> {
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = iconSrc;
  });
  const W = 1120;
  const H = 800;
  return [0, 1, 2].map((k) => {
    const bg = BGS[(k + shift * 3) % BGS.length]!;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return "";
    const blob = (x: number, y: number, r: number, col: string) => {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    };
    if (bg.kind === "pastel") {
      ctx.fillStyle = "#E9E0FF";
      ctx.fillRect(0, 0, W, H);
      blob(W * 0.18, H * 0.18, 620, "rgba(183,155,255,1)");
      blob(W * 0.9, H * 0.92, 620, "rgba(255,176,207,1)");
      blob(W * 0.9, H * 0.1, 460, "rgba(191,226,255,1)");
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, bg.stops[0]);
      g.addColorStop(0.5, bg.stops[1]);
      g.addColorStop(1, bg.stops[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      blob(W * 0.15, H * 0.2, 320, "rgba(255,255,255,.22)");
      blob(W * 0.9, H * 0.95, 380, "rgba(255,255,255,.14)");
    }
    if (img) {
      const size = H * (k === 0 ? 0.7 : 0.78);
      const rot = ((shift + k) % 2 ? 8 : -8) * (Math.PI / 180);
      ctx.save();
      ctx.translate(W * 0.5, H * 0.52);
      ctx.rotate(rot);
      ctx.shadowColor = "rgba(40,10,90,.32)";
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 26;
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    return cv.toDataURL("image/jpeg", 0.86);
  });
}
