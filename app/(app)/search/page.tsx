"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { EventCard, type EventCardData } from "@/components/feed/EventCard";
import { CityPicker } from "@/components/ui/CityPicker";

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
  const [city, setCity] = useState("Тюмень");
  const [cityInput, setCityInput] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [selectedCategorySlugs, setSelectedCategorySlugs] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("any");
  const [costFilter, setCostFilter] = useState<CostFilter>("any");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [genderFilter, setGenderFilter] = useState<"any" | "male" | "female">("any");

  const [appliedEventIds, setAppliedEventIds] = useState<Set<string>>(new Set());
  const [applyingEventId, setApplyingEventId] = useState<string | null>(null);

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
  useEffect(load, [city]);

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

  async function handleApply(eventId: string) {
    setApplyingEventId(eventId);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (res.ok) setAppliedEventIds((prev) => new Set(prev).add(eventId));
    } finally {
      setApplyingEventId(null);
    }
  }

  return (
    <div className="px-5 py-4">
      <h1 className="text-display mb-4">Поиск встреч</h1>

      <div className="mb-4 flex gap-2">
        <div className="flex-1">
          <CityPicker
            value={cityInput}
            onChange={(selected) => {
              setCityInput(selected);
              setCity(selected);
            }}
            placeholder="Город"
            className="w-full min-w-0 box-border rounded-pill border border-lavender-200 bg-white px-4 py-2.5 text-base outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="relative flex items-center gap-1.5 rounded-pill bg-white px-4 py-2.5 text-sm font-medium shadow-card"
        >
          <Image src="/brand/icons/filter.svg" alt="" width={16} height={16} />
          Фильтры
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <Link
        href={`/map?${buildFilterParams().toString()}`}
        className="mb-4 flex items-center justify-center gap-2 rounded-pill bg-white py-2.5 text-sm font-medium text-accent shadow-card"
      >
        <Image src="/brand/icons/map.svg" alt="" width={16} height={16} />
        Показать на карте
      </Link>

      {loading && <p className="text-center text-sm text-ink-600">Загрузка...</p>}
      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      {!loading && !error && events.length === 0 && (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="relative mb-4 h-28 w-28">
            <Image src="/brand/3d/empty-quiet.png" alt="" fill className="object-contain" sizes="112px" />
          </div>
          <p className="text-sm text-ink-600">Ничего не нашлось. Попробуй изменить фильтры.</p>
        </div>
      )}

      <div className="space-y-3">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onApplyPress={handleApply}
            applied={appliedEventIds.has(event.id)}
            applying={applyingEventId === event.id}
          />
        ))}
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30" onClick={() => setSheetOpen(false)}>
          <div
            className="max-h-[85vh] overflow-y-auto rounded-t-sheet bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="text-title mb-4">Фильтры</h2>

            <FilterSection title="Категория (можно несколько)">
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggleCategory(c.slug)}
                    className={`rounded-pill px-3.5 py-2 text-sm font-medium ${
                      selectedCategorySlugs.includes(c.slug)
                        ? "bg-brand-gradient text-white"
                        : "bg-lavender-50 text-ink-900"
                    }`}
                  >
                    {c.emoji} {c.name}
                  </button>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="Дата встречи">
              <ChoiceRow
                options={[
                  ["any", "Любой день"],
                  ["today", "Сегодня"],
                  ["tomorrow", "Завтра"],
                  ["weekend", "В выходные"],
                ]}
                value={["any", "today", "tomorrow", "weekend"].includes(dateFilter) ? dateFilter : "custom"}
                onChange={(v) => v !== "custom" && setDateFilter(v as DateFilter)}
              />
              <input
                type="date"
                value={!["any", "today", "tomorrow", "weekend"].includes(dateFilter) ? dateFilter : ""}
                onChange={(e) => setDateFilter(e.target.value || "any")}
                min={new Date().toISOString().slice(0, 10)}
                className="mt-2 w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-2.5 text-base outline-none focus:border-accent"
              />
            </FilterSection>

            <FilterSection title="Время встречи">
              <ChoiceRow
                options={[
                  ["any", "Любое"],
                  ["morning", "Утро"],
                  ["day", "День"],
                  ["evening", "Вечер"],
                ]}
                value={timeFilter}
                onChange={(v) => setTimeFilter(v as TimeFilter)}
              />
            </FilterSection>

            <FilterSection title="Расходы на встречу">
              <ChoiceRow
                options={[
                  ["any", "Неважно"],
                  ["each_pays", COST_LABELS.each_pays],
                  ["organizer_treats", COST_LABELS.organizer_treats],
                  ["free", COST_LABELS.free],
                  ["negotiable", COST_LABELS.negotiable],
                ]}
                value={costFilter}
                onChange={(v) => setCostFilter(v as CostFilter)}
              />
            </FilterSection>

            <FilterSection title="Возраст автора встречи">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                  placeholder="От"
                  className="w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-2.5 text-base outline-none focus:border-accent"
                />
                <span className="text-ink-400">—</span>
                <input
                  type="number"
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                  placeholder="До"
                  className="w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-2.5 text-base outline-none focus:border-accent"
                />
              </div>
              <p className="mt-1 text-xs text-ink-400">По умолчанию без ограничений</p>
            </FilterSection>

            <FilterSection title="Кто создал встречу">
              <ChoiceRow
                options={[
                  ["any", "Неважно"],
                  ["male", "Мужчина"],
                  ["female", "Женщина"],
                ]}
                value={genderFilter}
                onChange={(v) => setGenderFilter(v as "any" | "male" | "female")}
              />
            </FilterSection>

            <div className="flex gap-3">
              <button
                onClick={resetFilters}
                className="w-auto flex-1 rounded-pill border border-lavender-200 bg-white py-3.5 text-sm font-medium text-ink-600"
              >
                Сбросить
              </button>
              <button
                onClick={applyFilters}
                className="flex-[2] rounded-pill bg-brand-gradient py-3.5 text-sm font-semibold text-white shadow-cta"
              >
                Показать встречи
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-sm font-medium text-ink-900">{title}</h3>
      {children}
    </div>
  );
}

function ChoiceRow({
  options,
  value,
  onChange,
}: {
  options: [string, string][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([val, label]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={`rounded-pill px-3.5 py-2 text-sm font-medium ${
            value === val ? "bg-brand-gradient text-white" : "bg-lavender-50 text-ink-900"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
