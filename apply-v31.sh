mkdir -p "lib/data"
cat > "lib/data/russian-cities.ts" << 'ENDOFFILE'
// Список городов России для выбора при регистрации/поиске — только из
// этого списка, свободный ввод не допускается (см. запрос пользователя).
const RAW_CITIES: string[] = [
  "Абакан", "Азов", "Александров", "Алексин", "Алушта", "Альметьевск", "Ангарск", "Анапа", "Апатиты",
  "Арзамас", "Армавир", "Арсеньев", "Артём", "Архангельск", "Асбест", "Астрахань", "Ачинск",
  "Балаково", "Балашиха", "Балашов", "Барнаул", "Батайск", "Бахчисарай", "Белгород", "Белебей",
  "Белово", "Белорецк", "Белореченск", "Бердск", "Березники", "Бийск", "Благовещенск", "Бор",
  "Боровичи", "Братск", "Брянск", "Бугульма", "Бузулук",
  "Валдай", "Великие Луки", "Великий Новгород", "Великий Устюг", "Верхняя Пышма", "Видное",
  "Владивосток", "Владикавказ", "Владимир", "Волгоград", "Волгодонск", "Волжский", "Вологда",
  "Вольск", "Воркута", "Воронеж", "Воскресенск", "Всеволожск", "Выборг", "Выкса",
  "Гатчина", "Геленджик", "Горно-Алтайск", "Грозный", "Губкин", "Гуково", "Гусь-Хрустальный",
  "Дербент", "Дзержинск", "Дзержинский", "Димитровград", "Дмитров", "Долгопрудный", "Домодедово",
  "Донской", "Дубна",
  "Евпатория", "Егорьевск", "Екатеринбург", "Елабуга", "Елец", "Ессентуки",
  "Железногорск", "Железнодорожный", "Жигулёвск", "Жуковский",
  "Заречный", "Заринск", "Звенигород", "Зеленогорск", "Зеленоград", "Зеленодольск", "Златоуст",
  "Иваново", "Ивантеевка", "Ижевск", "Излучинск", "Иркутск",
  "Йошкар-Ола",
  "Кабардинка", "Казань", "Калининград", "Калуга", "Каменск-Уральский", "Камышин", "Канск",
  "Каспийск", "Кемерово", "Керчь", "Кизляр", "Кинешма", "Киров", "Кириши", "Кисловодск",
  "Клин", "Клинцы", "Ковров", "Когалым", "Коломна", "Комсомольск-на-Амуре", "Копейск",
  "Кострома", "Котлас", "Красноармейск", "Краснодар", "Красногорск", "Краснокаменск",
  "Краснотурьинск", "Красноярск", "Кропоткин", "Кстово", "Кузнецк", "Кумертау", "Курган",
  "Курск", "Кызыл",
  "Ливны", "Липецк", "Лиски", "Лобня", "Лодейное Поле", "Лосино-Петровский", "Луга", "Лысьва",
  "Люберцы",
  "Магадан", "Магнитогорск", "Майкоп", "Махачкала", "Мелеуз", "Миасс", "Минеральные Воды",
  "Мичуринск", "Могилёв", "Можайск", "Москва", "Муравленко", "Муром", "Мытищи",
  "Набережные Челны", "Назарово", "Назрань", "Нальчик", "Наро-Фоминск", "Находка", "Невинномысск",
  "Нефтекамск", "Нефтеюганск", "Нижневартовск", "Нижнекамск", "Нижний Новгород", "Нижний Тагил",
  "Новоалтайск", "Новокузнецк", "Новокуйбышевск", "Новомосковск", "Новороссийск", "Новосибирск",
  "Новочебоксарск", "Новочеркасск", "Новый Уренгой", "Ногинск", "Норильск", "Ноябрьск",
  "Обнинск", "Одинцово", "Октябрьский", "Омск", "Орёл", "Оренбург", "Орехово-Зуево", "Орск",
  "Отрадное",
  "Павлово", "Павловский Посад", "Пенза", "Первоуральск", "Пермь", "Петергоф", "Петрозаводск",
  "Петропавловск-Камчатский", "Подольск", "Полевской", "Прокопьевск", "Псков", "Пушкино",
  "Пятигорск",
  "Раменское", "Ревда", "Реутов", "Ржев", "Ростов-на-Дону", "Рубцовск", "Рыбинск", "Рязань",
  "Салават", "Самара", "Санкт-Петербург", "Саранск", "Саратов", "Сарапул", "Сасово",
  "Севастополь", "Северодвинск", "Северск", "Сергиев Посад", "Серов", "Серпухов",
  "Симферополь", "Сызрань", "Сыктывкар", "Смоленск", "Соликамск", "Солнечногорск", "Сочи",
  "Ставрополь", "Старый Оскол", "Стерлитамак", "Ступино", "Судак", "Сургут", "Сухой Лог",
  "Таганрог", "Тамбов", "Тверь", "Тобольск", "Тольятти", "Томск", "Туапсе", "Туймазы",
  "Тула", "Тюмень",
  "Улан-Удэ", "Ульяновск", "Урай", "Уссурийск", "Усть-Илимск", "Уфа", "Ухта",
  "Феодосия", "Фрязино",
  "Хабаровск", "Ханты-Мансийск", "Химки",
  "Чебоксары", "Челябинск", "Череповец", "Черкесск", "Чехов", "Чита",
  "Шадринск", "Шахты", "Щёлково", "Щербинка",
  "Электросталь", "Элиста", "Энгельс",
  "Юбилейный", "Южно-Сахалинск", "Якутск", "Ялта", "Ямбург", "Ярославль",
];

// Гарантированно отсортированный и без дублей — на этот список опирается
// сам выбор города (CityPicker), а не на порядок в массиве выше.
export const RUSSIAN_CITIES: string[] = Array.from(new Set(RAW_CITIES)).sort((a, b) =>
  a.localeCompare(b, "ru")
);
ENDOFFILE

mkdir -p "components/ui"
cat > "components/ui/CityPicker.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useRef, useState } from "react";
import { RUSSIAN_CITIES } from "@/lib/data/russian-cities";

interface CityPickerProps {
  value: string;
  onChange: (city: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Выбор города — только из списка городов России (lib/data/russian-cities.ts),
 * свободный ввод произвольного текста не сохраняется. Печатаешь — список
 * фильтруется живьём; если не выбрать город из выпадающего списка, при
 * потере фокуса поле откатывается к последнему реально выбранному значению.
 */
export function CityPicker({ value, onChange, placeholder = "Город", className = "", autoFocus }: CityPickerProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value); // отменяем недописанный/невыбранный ввод
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  const filtered = query.trim()
    ? RUSSIAN_CITIES.filter((c) => c.toLowerCase().startsWith(query.trim().toLowerCase())).slice(0, 50)
    : RUSSIAN_CITIES;

  function selectCity(city: string) {
    onChange(city);
    setQuery(city);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
      />
      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-card bg-white shadow-card-lg">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-400">Такого города нет в списке</p>
          ) : (
            filtered.map((city) => (
              <button
                key={city}
                type="button"
                onClick={() => selectCity(city)}
                className="block w-full px-4 py-2.5 text-left text-sm text-ink-900 hover:bg-lavender-50"
              >
                {city}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
ENDOFFILE

mkdir -p "components/onboarding"
cat > "components/onboarding/OnboardingWizard.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StepProgress } from "@/components/ui/StepProgress";
import { CityPicker } from "@/components/ui/CityPicker";
import { getInitData } from "@/lib/telegram/webapp-client";

interface Interest {
  id: string;
  name: string;
  emoji: string | null;
}

type Step = "photo" | "name" | "birthDate" | "gender" | "city" | "bio" | "interests" | "review";
const STEPS: Step[] = ["photo", "name", "birthDate", "gender", "city", "bio", "interests", "review"];

export function OnboardingWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [photoBase64, setPhotoBase64] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [selectedInterestIds, setSelectedInterestIds] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/interests")
      .then((r) => r.json())
      .then((data) => setInterests(data.interests ?? []))
      .catch(() => setInterests([]));
  }, []);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  function goNext() {
    setError(null);
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
  }
  function goBack() {
    setError(null);
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  function toggleInterest(id: string) {
    setSelectedInterestIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoBase64(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const initData = getInitData();
    if (!initData) {
      setError("Открой приложение через Telegram, чтобы продолжить.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          profile: {
            name,
            birthDate,
            gender,
            city,
            bio,
            interestIds: selectedInterestIds,
            photoBase64,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "validation_failed") {
          setError("Проверь, что все поля заполнены корректно.");
        } else if (data.error === "already_registered") {
          window.location.href = "/feed";
          return;
        } else {
          setError("Не получилось сохранить профиль. Попробуй ещё раз.");
        }
        setSubmitting(false);
        return;
      }

      window.location.href = "/feed";
    } catch {
      setError("Проблема с соединением. Попробуй ещё раз.");
      setSubmitting(false);
    }
  }

  const canGoNext =
    (step === "photo") ||
    (step === "name" && name.trim().length >= 2) ||
    (step === "birthDate" && birthDate.length > 0) ||
    (step === "gender" && gender !== null) ||
    (step === "city" && city.trim().length >= 2) ||
    (step === "bio") ||
    (step === "interests");

  return (
    <div className="flex min-h-screen flex-col px-5 pb-8 pt-6">
      <StepProgress currentStep={stepIndex + 1} totalSteps={STEPS.length} />

      <div className="flex flex-1 flex-col justify-center gap-6 py-10">
        {step === "photo" && (
          <StepBlock title="Добавь фото" subtitle="Можно пропустить и добавить позже, в профиле.">
            <label className="flex aspect-square w-40 mx-auto items-center justify-center overflow-hidden rounded-full bg-white shadow-card">
              {photoBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoBase64} alt="Фото профиля" className="h-full w-full object-cover" />
              ) : (
                <span className="text-4xl">📷</span>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </label>
          </StepBlock>
        )}

        {step === "name" && (
          <StepBlock title="Как тебя зовут?">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя"
              className="w-full rounded-card border border-ink-400/20 bg-white px-5 py-4 text-lg outline-none focus:border-accent"
            />
          </StepBlock>
        )}

        {step === "birthDate" && (
          <StepBlock title="Дата рождения" subtitle="Сервис доступен пользователям 18+.">
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full rounded-card border border-ink-400/20 bg-white px-5 py-4 text-lg outline-none focus:border-accent"
            />
          </StepBlock>
        )}

        {step === "gender" && (
          <StepBlock title="Твой пол">
            <div className="flex gap-3">
              {(
                [
                  ["male", "Мужчина"],
                  ["female", "Женщина"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGender(value)}
                  className={`flex-1 rounded-card border p-5 text-center text-base font-medium transition ${
                    gender === value
                      ? "border-accent bg-brand-gradient text-white shadow-cta"
                      : "border-ink-400/20 bg-white text-ink-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </StepBlock>
        )}

        {step === "city" && (
          <StepBlock title="Твой город">
            <CityPicker
              autoFocus
              value={city}
              onChange={setCity}
              placeholder="Начни вводить город"
              className="w-full rounded-card border border-ink-400/20 bg-white px-5 py-4 text-lg outline-none focus:border-accent"
            />
          </StepBlock>
        )}

        {step === "bio" && (
          <StepBlock title="Пару слов о себе" subtitle="Необязательно, но помогает другим тебя узнать.">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={300}
              rows={4}
              placeholder="Расскажи немного о себе..."
              className="w-full resize-none rounded-card border border-ink-400/20 bg-white px-5 py-4 text-lg outline-none focus:border-accent"
            />
          </StepBlock>
        )}

        {step === "interests" && (
          <StepBlock title="Что тебе интересно?" subtitle="Выбери несколько — необязательно.">
            <div className="flex flex-wrap gap-2">
              {interests.map((interest) => {
                const selected = selectedInterestIds.includes(interest.id);
                return (
                  <button
                    key={interest.id}
                    type="button"
                    onClick={() => toggleInterest(interest.id)}
                    className={`rounded-pill border px-4 py-2 text-sm font-medium transition ${
                      selected
                        ? "border-accent bg-accent text-white"
                        : "border-ink-400/20 bg-white text-ink-900"
                    }`}
                  >
                    {interest.emoji} {interest.name}
                  </button>
                );
              })}
            </div>
          </StepBlock>
        )}

        {step === "review" && (
          <StepBlock title="Всё верно?">
            <div className="space-y-2 rounded-card bg-white p-5 shadow-card">
              <ReviewRow label="Имя" value={name} />
              <ReviewRow label="Дата рождения" value={birthDate} />
              <ReviewRow label="Пол" value={gender === "male" ? "Мужчина" : "Женщина"} />
              <ReviewRow label="Город" value={city} />
              {bio && <ReviewRow label="О себе" value={bio} />}
            </div>
          </StepBlock>
        )}

        {error && <p className="text-center text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex gap-3">
        {stepIndex > 0 && (
          <Button variant="secondary" onClick={goBack} className="w-auto px-6">
            Назад
          </Button>
        )}
        {!isLastStep ? (
          <Button onClick={goNext} disabled={!canGoNext}>
            Далее
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Сохраняем..." : "Готово"}
          </Button>
        )}
      </div>
    </div>
  );
}

function StepBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-display">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-600">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-ink-600">{label}</span>
      <span className="text-right font-medium text-ink-900">{value}</span>
    </div>
  );
}
ENDOFFILE

mkdir -p "app/(app)/feed"
cat > "app/(app)/feed/page.tsx" << 'ENDOFFILE'
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { TopBar } from "@/components/layout/TopBar";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { TrainingTypeSheet } from "@/components/home/TrainingTypeSheet";
import { EventCard, type EventCardData } from "@/components/feed/EventCard";
import { Button } from "@/components/ui/Button";
import { CityPicker } from "@/components/ui/CityPicker";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

interface TrainingType {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

export default function FeedPage() {
  return (
    // useSearchParams требует Suspense-границу в Next.js App Router
    <Suspense>
      <FeedPageContent />
    </Suspense>
  );
}

function FeedPageContent() {
  const searchParams = useSearchParams();
  const categoryFilter = searchParams.get("category");
  const typeFilter = searchParams.get("type");

  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [events, setEvents] = useState<EventCardData[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appliedEventIds, setAppliedEventIds] = useState<Set<string>>(new Set());
  const [applyingEventId, setApplyingEventId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [city, setCity] = useState("Тюмень");
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const [cityInput, setCityInput] = useState("");

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((data) => {
        setAvatarUrl(data.avatarUrl ?? null);
        if (data.city) {
          setCity(data.city);
          setCityInput(data.city);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories ?? []);
        setTrainingTypes(data.trainingTypes ?? []);
      })
      .catch(() => {
        setCategories([]);
        setTrainingTypes([]);
      });
  }, []);

  useEffect(() => {
    setEvents([]);
    setPage(0);
    loadPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, typeFilter, city]);

  async function loadPage(pageToLoad: number, replace: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pageToLoad), city });
      if (categoryFilter) params.set("category", categoryFilter);
      if (typeFilter) params.set("type", typeFilter);

      const res = await fetch(`/api/events?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error === "city_required" ? "Сначала заверши регистрацию." : "Не удалось загрузить ленту.");
        return;
      }

      setEvents((prev) => (replace ? data.items : [...prev, ...data.items]));
      setHasMore(Boolean(data.hasMore));
      setPage(pageToLoad);
    } catch {
      setError("Проблема с соединением.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(eventId: string) {
    if (appliedEventIds.has(eventId) || applyingEventId) return;
    setApplyingEventId(eventId);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();

      if (res.ok) {
        setAppliedEventIds((prev) => new Set(prev).add(eventId));
        setToast("Отклик отправлен! Организатор скоро ответит.");
      } else if (data.error === "already_applied") {
        setAppliedEventIds((prev) => new Set(prev).add(eventId));
        setToast("Ты уже откликался на эту встречу.");
      } else if (data.error === "event_full") {
        setToast("Мест уже не осталось.");
      } else if (data.error === "cannot_apply_to_own_event") {
        setToast("Это твоя встреча — не нужно откликаться на неё самому.");
      } else {
        setToast("Не получилось отправить отклик.");
      }
    } catch {
      setToast("Проблема с соединением.");
    } finally {
      setApplyingEventId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div>
      <TopBar city={city} avatarUrl={avatarUrl} onCityPress={() => setCitySheetOpen(true)} />

      <div className="px-5 pb-2 pt-6">
        <h1 className="text-display">
          Что ищешь <span className="text-accent">сегодня?</span>
        </h1>
      </div>

      <CategoryGrid categories={categories} onTrainingPress={() => setSheetOpen(true)} />

      <div className="mt-8 space-y-3 px-5">
        <h2 className="text-title">Интересные встречи рядом</h2>

        {loading && events.length === 0 && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-card bg-white shadow-card" />
            ))}
          </div>
        )}

        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {!loading && !error && events.length === 0 && (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="relative mb-4 h-32 w-32">
              <Image src="/brand/3d/empty-quiet.png" alt="" fill className="object-contain" sizes="128px" />
            </div>
            <p className="text-sm text-ink-600">Сегодня пока тихо. Создайте первый план в своём городе.</p>
          </div>
        )}

        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            applied={appliedEventIds.has(event.id)}
            applying={applyingEventId === event.id}
            onApplyPress={handleApply}
          />
        ))}

        {hasMore && (
          <Button variant="secondary" onClick={() => loadPage(page + 1, false)} disabled={loading}>
            {loading ? "Загружаем..." : "Показать ещё"}
          </Button>
        )}
      </div>

      <TrainingTypeSheet
        open={sheetOpen}
        trainingTypes={trainingTypes}
        onClose={() => setSheetOpen(false)}
      />

      {toast && (
        <div className="fixed inset-x-5 bottom-24 z-50 rounded-card bg-ink-900 px-4 py-3 text-center text-sm text-white shadow-card">
          {toast}
        </div>
      )}

      {citySheetOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30"
          onClick={() => setCitySheetOpen(false)}
        >
          <div
            className="rounded-t-sheet bg-white p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="text-title mb-4">Выбери город</h2>
            <CityPicker
              autoFocus
              value={cityInput}
              onChange={(selected) => {
                setCityInput(selected);
                setCity(selected);
                setCitySheetOpen(false);
              }}
              placeholder="Начни вводить город"
              className="w-full min-w-0 box-border rounded-card border border-lavender-200 bg-background px-4 py-3 text-base outline-none focus:border-accent"
            />
          </div>
        </div>
      )}
    </div>
  );
}
ENDOFFILE

mkdir -p "app/(app)/search"
cat > "app/(app)/search/page.tsx" << 'ENDOFFILE'
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
ENDOFFILE

