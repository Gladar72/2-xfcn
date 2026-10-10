"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { JoinFlow } from "@/components/events/JoinFlow";
import { useGuide } from "@/lib/mosya/guide";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { EventCardData } from "@/components/feed/EventCard";
import { EmptyIll, Ic, RowCard, Screen, Sheet, Toast } from "@/components/proto/ui";
import { CityPicker } from "@/components/ui/CityPicker";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { CATEGORY_ICON } from "@/lib/data/category-icons";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

type DateFilter = "any" | "today" | "tomorrow" | "weekend" | string; // строка формата YYYY-MM-DD — конкретный день
type TimeFilter = "any" | "morning" | "day" | "evening";
type CostFilter = "any" | "each_pays" | "organizer_treats" | "free" | "negotiable";

const COST_LABELS: Record<Exclude<CostFilter, "any">, string> = {
  each_pays: "Каждый за себя",
  organizer_treats: "Автор угощает",
  free: "Без расходов",
  negotiable: "По договорённости",
};

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageContent />
    </Suspense>
  );
}

function SearchPageContent() {
  const [city, setCity] = useState("Тюмень");
  const [cityInput, setCityInput] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [loading, setLoading] = useState(true);
  useGuide("search");
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Блокируем прокрутку body, только пока открыта шторка фильтров — в ней
  // есть текстовые поля (возраст, дата), фокус на них без этой блокировки
  // заставляет WebView Telegram сдвигать экран, чтобы подвести поле под
  // клавиатуру (та же причина, что чинили в чате и мастере создания).

  const [selectedCategorySlugs, setSelectedCategorySlugs] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("any");
  const [costFilter, setCostFilter] = useState<CostFilter>("any");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [genderFilter, setGenderFilter] = useState<"any" | "male" | "female">("any");

  const [appliedEventIds, setAppliedEventIds] = useState<Set<string>>(new Set());
  const [applyingEventId, setApplyingEventId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();
  const sp = useSearchParams();
  const openFilters = sp.get("filters") === "1";
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (openFilters) setSheetOpen(true);
  }, [openFilters]);

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && data.city) {
          setCity(data.city);
          setCityInput(data.city);
        }
      });
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => setCategories(data.categories ?? []));
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategorySlugs.length > 0) count++;
    if (dateFilter !== "any") count++;
    if (timeFilter !== "any") count++;
    if (costFilter !== "any") count++;
    if (ageMin || ageMax) count++;
    if (genderFilter !== "any") count++;
    return count;
  }, [selectedCategorySlugs, dateFilter, timeFilter, costFilter, ageMin, ageMax, genderFilter]);

  function buildFilterParams(): URLSearchParams {
    const params = new URLSearchParams();
    params.set("city", city);
    if (selectedCategorySlugs.length > 0) params.set("categories", selectedCategorySlugs.join(","));
    if (dateFilter !== "any") params.set("date", dateFilter);
    if (timeFilter !== "any") params.set("timeOfDay", timeFilter);
    if (costFilter !== "any") params.set("costType", costFilter);
    if (ageMin) params.set("ageMin", ageMin);
    if (ageMax) params.set("ageMax", ageMax);
    if (genderFilter !== "any") params.set("gender", genderFilter);
    return params;
  }

  function load() {
    setLoading(true);
    setError(null);
    const params = buildFilterParams();

    fetch(`/api/events?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError("Не удалось загрузить встречи.");
          return;
        }
        setEvents(data.items ?? []);
      })
      .catch(() => setError("Проблема с соединением."))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [city, reloadKey]);

  function toggleCategory(slug: string) {
    setSelectedCategorySlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  function applyFilters() {
    setSheetOpen(false);
    load();
  }

  function resetFilters() {
    setSelectedCategorySlugs([]);
    setDateFilter("any");
    setTimeFilter("any");
    setCostFilter("any");
    setAgeMin("");
    setAgeMax("");
    setGenderFilter("any");
  }

  const [joinEvent, setJoinEvent] = useState<EventCardData | null>(null);
  const [joinPhase, setJoinPhase] = useState<"confirm" | "sending" | "done" | null>(null);

  function openJoin(eventId: string) {
    if (appliedEventIds.has(eventId) || applyingEventId) return;
    setJoinEvent(events.find((e) => e.id === eventId) ?? null);
    setJoinPhase("confirm");
  }

  async function confirmJoin() {
    if (!joinEvent) return;
    setJoinPhase("sending");
    const ok = await handleApply(joinEvent.id);
    if (ok) setJoinPhase("done");
    else {
      setJoinPhase(null);
      setJoinEvent(null);
    }
  }

  async function handleApply(eventId: string): Promise<boolean> {
    let ok = false;
    setApplyingEventId(eventId);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || data.error === "already_applied") {
        ok = res.ok;
        setAppliedEventIds((prev) => new Set(prev).add(eventId));
        if (!res.ok) setToast(apiErrorText(data, ""));
      } else {
        // Раньше при ошибке ничего не происходило — человек не понимал почему.
        setToast(apiErrorText(data, "Не получилось отправить отклик.", res.status));
      }
    } catch {
      setToast("Проблема с соединением.");
    } finally {
      setApplyingEventId(null);
      setTimeout(() => setToast(null), 3500);
    }
    return ok;
  }

  const q = query.trim().toLowerCase();
  const list = q
    ? events.filter((e) => [e.title, e.placeName, e.description, e.category?.name, e.trainingType?.name].filter(Boolean).some((t) => (t as string).toLowerCase().includes(q)))
    : events;

  function quick(k: "today" | "tomorrow" | "weekend" | "free") {
    if (k === "free") setCostFilter((c) => (c === "free" ? "any" : "free"));
    else setDateFilter((d) => (d === k ? "any" : k));
    setReloadKey((n) => n + 1);
  }

  const row = (label: string, opts: [string, string][], value: string, set: (v: string) => void) => (
    <>
      <span className="lbl" style={{ margin: 0 }}>
        {label}
      </span>
      <div className="chs">
        {opts.map(([v, t]) => (
          <button key={v} className={value === v ? "on" : "gl"} onClick={() => set(v)}>
            {t}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <Screen id="search" anim="in">
      <div className="search" style={{ marginTop: 0 }}>
        <button className="rb gl" onClick={() => router.back()} aria-label="Назад">
          <Ic n="back" />
        </button>
        <label className="sfield gl" style={{ cursor: "text" }}>
          <Ic n="search" c="s" />
          <input
            autoFocus={!openFilters}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Что ищем?"
            style={{ flex: 1, border: 0, background: "none", font: "inherit", fontSize: 15, outline: "none", color: "var(--ink)", minWidth: 0 }}
          />
        </label>
        <button className="rb k" onClick={() => setSheetOpen(true)} aria-label="Фильтры" style={{ width: 50, height: 50 }}>
          <Ic n="filter" />
          {activeFilterCount > 0 && <span className="cnt">{activeFilterCount}</span>}
        </button>
      </div>
      <div className="chipsrow" style={{ marginTop: 14 }}>
        {(
          [
            ["today", "Сегодня"],
            ["tomorrow", "Завтра"],
            ["weekend", "На выходных"],
            ["free", "Бесплатно"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`chip ${(k === "free" ? costFilter === "free" : dateFilter === k) ? "on" : "gl"}`} onClick={() => quick(k)}>
            {l}
          </button>
        ))}
        <Link className="chip gl" href={`/map?${buildFilterParams().toString()}`} style={{ display: "inline-grid", placeItems: "center" }}>
          На карте
        </Link>
      </div>
      <div className="sec">
        <b>Категории</b>
        <span>{city}</span>
      </div>
      <div className="igrid">
        {categories
          .filter((c) => c.slug !== "custom")
          .map((c) => (
            <button
              key={c.id}
              className={`it ${selectedCategorySlugs.includes(c.slug) ? "sel" : "gl"}`}
              onClick={() => {
                toggleCategory(c.slug);
                setReloadKey((n) => n + 1);
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
      <div className="sec">
        <b>{q ? `Нашлось: ${list.length}` : "Все встречи"}</b>
        {activeFilterCount > 0 && (
          <button
            onClick={() => {
              resetFilters();
              setReloadKey((n) => n + 1);
            }}
          >
            Сбросить
          </button>
        )}
      </div>
      <div className="list">
        {loading && [0, 1, 2].map((i) => <div key={i} className="sk" style={{ height: 76 }} />)}
        {error && <div className="note gl">{error}</div>}
        {!loading &&
          list.map((e) => (
            <RowCard key={e.id} e={e} status={appliedEventIds.has(e.id) ? "pending" : e.myApplicationStatus ?? null} onJoin={openJoin} />
          ))}
        {!loading && !error && list.length === 0 && (
          <div className="empty">
            <EmptyIll />
            <b>Ничего не нашлось</b>
            <span>Попробуй другие фильтры — или создай свою встречу, люди подтянутся.</span>
            <Link className="btn v" href="/create" style={{ width: "100%", marginTop: 8 }}>
              Создать встречу
            </Link>
          </div>
        )}
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <h2 className="t">Фильтры</h2>
        <span className="lbl" style={{ margin: 0 }}>
          Город
        </span>
        <div className="field gl">
          <CityPicker
            value={cityInput}
            onChange={(selected) => {
              setCityInput(selected);
              setCity(selected);
            }}
            placeholder="Город"
            dropdownDirection="down"
            className="w-full border-0 bg-transparent text-base outline-none"
          />
        </div>
        {row(
          "Дата встречи",
          [
            ["any", "Любой день"],
            ["today", "Сегодня"],
            ["tomorrow", "Завтра"],
            ["weekend", "В выходные"],
          ],
          ["any", "today", "tomorrow", "weekend"].includes(dateFilter) ? dateFilter : "date",
          (v) => setDateFilter(v)
        )}
        <label className="field gl" style={{ minHeight: 44 }}>
          <Ic n="cal" c="s" />
          <input type="date" value={/^\d{4}-/.test(dateFilter) ? dateFilter : ""} onChange={(e) => setDateFilter(e.target.value || "any")} />
        </label>
        {row(
          "Время",
          [
            ["any", "Любое"],
            ["morning", "Утро"],
            ["day", "День"],
            ["evening", "Вечер"],
          ],
          timeFilter,
          (v) => setTimeFilter(v as TimeFilter)
        )}
        {row("Расходы", [["any", "Неважно"], ...(Object.entries(COST_LABELS) as [string, string][])], costFilter, (v) => setCostFilter(v as CostFilter))}
        {row(
          "Кто создал",
          [
            ["any", "Неважно"],
            ["male", "Мужчина"],
            ["female", "Женщина"],
          ],
          genderFilter,
          (v) => setGenderFilter(v as "any" | "male" | "female")
        )}
        <span className="lbl" style={{ margin: 0 }}>
          Возраст автора
        </span>
        <div className="chs">
          <label className="field gl" style={{ minHeight: 44, width: 110 }}>
            <input placeholder="от 18" inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </label>
          <label className="field gl" style={{ minHeight: 44, width: 110 }}>
            <input placeholder="до 45" inputMode="numeric" value={ageMax} onChange={(e) => setAgeMax(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </label>
        </div>
        <div className="twob" style={{ margin: 0 }}>
          <button className="btn o" onClick={resetFilters}>
            Сбросить
          </button>
          <button className="btn k" onClick={applyFilters}>
            Показать встречи
          </button>
        </div>
      </Sheet>

      <Toast text={toast} />
      <JoinFlow
        event={joinEvent}
        phase={joinPhase}
        onConfirm={confirmJoin}
        onClose={() => {
          setJoinPhase(null);
          setJoinEvent(null);
        }}
      />
    </Screen>
  );
}

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
