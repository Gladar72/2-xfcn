mkdir -p "lib/validation"
cat > "lib/validation/onboarding.ts" << 'ENDOFFILE'
import { z } from "zod";

/**
 * Проверка возраста 18+ на дату отправки формы. Дублирует check-constraint
 * в БД (users_18_plus, миграция 0002) — БД это последний рубеж, а это
 * первый, чтобы пользователь увидел понятную ошибку сразу в форме.
 */
function isAtLeast18(birthDateIso: string, now: Date = new Date()): boolean {
  const birthDate = new Date(birthDateIso);
  if (Number.isNaN(birthDate.getTime())) return false;
  const eighteenYearsAgo = new Date(now);
  eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
  return birthDate <= eighteenYearsAgo;
}

export const onboardingSchema = z.object({
  name: z.string().trim().min(2, "Имя слишком короткое").max(60),
  birthDate: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Некорректная дата")
    .refine((v) => isAtLeast18(v), "Сервис доступен только пользователям 18+"),
  gender: z.enum(["male", "female"], { errorMap: () => ({ message: "Укажите пол" }) }),
  city: z.string().trim().min(2, "Укажите город").max(80),
  bio: z.string().trim().max(300).optional().default(""),
  interestIds: z.array(z.string().uuid()).max(15).default([]),
  // Фото — base64 data URL (data:image/jpeg;base64,...), проверяем размер отдельно на бэкенде.
  photoBase64: z.string().startsWith("data:image/", "Ожидается изображение").optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
ENDOFFILE

mkdir -p "app/api/users"
cat > "app/api/users/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { validateTelegramInitData } from "@/lib/telegram/validate-init-data";
import { onboardingSchema } from "@/lib/validation/onboarding";
import { issueSessionToken, SESSION_COOKIE } from "@/lib/telegram/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadAvatar } from "@/lib/photos/upload-avatar";

/**
 * POST /api/users
 * Body: { initData: string, profile: OnboardingInput }
 *
 * Регистрация нового пользователя. Принимает initData ЗАНОВО (а не полагается
 * на cookie-сессию), потому что на этом шаге аккаунта/сессии ещё не существует —
 * см. app/api/auth/route.ts, ветку "needs_registration".
 *
 * Ничего из тела запроса не считается доверенным до проверки initData:
 * telegram_id пользователя мы берём ТОЛЬКО из проверенной initData,
 * а не из тела запроса, иначе кто угодно мог бы создать профиль от чужого имени.
 */
export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.initData !== "string") {
    return NextResponse.json({ error: "missing_init_data" }, { status: 400 });
  }

  const authResult = validateTelegramInitData(body.initData, botToken);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: "invalid_init_data", reason: authResult.reason },
      { status: 401 }
    );
  }

  const parsedProfile = onboardingSchema.safeParse(body.profile);
  if (!parsedProfile.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsedProfile.error.flatten() },
      { status: 422 }
    );
  }

  const telegramUser = authResult.data.user;
  const profile = parsedProfile.data;
  const admin = createAdminClient();

  // На случай повторного вызова (например, пользователь дважды нажал "Готово")
  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("telegram_id", telegramUser.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "already_registered" }, { status: 409 });
  }

  const { data: createdUser, error: insertUserError } = await admin
    .from("users")
    .insert({
      telegram_id: telegramUser.id,
      telegram_username: telegramUser.username ?? null,
      name: profile.name,
      birth_date: profile.birthDate,
      gender: profile.gender,
      city: profile.city,
      bio: profile.bio,
    })
    .select("id")
    .single();

  if (insertUserError || !createdUser) {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  const userId = createdUser.id as string;

  // Фото — необязательно на регистрации (можно добавить позже из профиля),
  // но если прислано — грузим в Storage и обновляем avatar_url.
  if (profile.photoBase64) {
    const uploadResult = await uploadAvatar(admin, userId, profile.photoBase64);
    if (!uploadResult.ok) {
      return NextResponse.json({ error: uploadResult.error }, { status: 422 });
    }
    await admin.from("users").update({ avatar_url: uploadResult.publicUrl }).eq("id", userId);
    await admin.from("user_photos").insert({ user_id: userId, url: uploadResult.publicUrl, position: 0 });
  }

  if (profile.interestIds.length > 0) {
    const rows = profile.interestIds.map((interestId) => ({ user_id: userId, interest_id: interestId }));
    await admin.from("user_interests").insert(rows);
  }

  const sessionToken = issueSessionToken(userId, telegramUser.id);
  const response = NextResponse.json({ status: "registered", userId });
  response.cookies.set(SESSION_COOKIE.name, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: SESSION_COOKIE.maxAgeSeconds,
  });
  return response;
}
ENDOFFILE

mkdir -p "components/onboarding"
cat > "components/onboarding/OnboardingWizard.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StepProgress } from "@/components/ui/StepProgress";
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
            <input
              autoFocus
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Например, Тюмень"
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

mkdir -p "app/api/events"
cat > "app/api/events/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { isAdminTelegramId } from "@/lib/admin/is-admin";
import { rankEvents, type EventForScoring, type SubscriptionPlan } from "@/lib/scoring/rank-events";
import { getActiveSubscriptionInfo, incrementEventsCreated } from "@/lib/subscriptions/server";
import { canCreateMoreEvents, PLAN_LIMITS } from "@/lib/subscriptions/limits";
import { createEventSchema } from "@/lib/validation/create-event";
import { notifyN8n } from "@/lib/n8n/notify";

const PAGE_SIZE = 20;
// Сколько кандидатов тянем из БД до ranking (больше видимого лимита,
// чтобы скоринг реально на что-то влиял, а не только на 20 случайных строк).
const CANDIDATE_POOL_SIZE = 150;

/**
 * GET /api/events?category=slug&type=slug&city=...&page=0
 *
 * Публичная лента опубликованных встреч. Бизнес-правила:
 * - показываем только status = 'published' и дату/время >= сейчас;
 * - скрываем встречи заблокированных друг для друга людей;
 * - ranking считается на backend (service_role, читает subscriptions
 *   организатора для планового коэффициента — это НЕ видно клиенту напрямую,
 *   используется только для сортировки, см. lib/scoring/rank-events.ts).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categorySlug = searchParams.get("category");
  const categorySlugsParam = searchParams.get("categories"); // новое: несколько категорий через запятую (экран поиска)
  const typeSlug = searchParams.get("type");
  const page = Math.max(0, Number(searchParams.get("page") ?? 0) || 0);
  // Новые фильтры экрана поиска (п. запроса пользователя) — все опциональны,
  // лента (feed) их не передаёт и продолжает работать как раньше.
  const dateFilter = searchParams.get("date"); // 'today' | 'tomorrow' | 'weekend' | 'any' | 'YYYY-MM-DD'
  const timeOfDay = searchParams.get("timeOfDay"); // 'morning' | 'day' | 'evening' | 'any'
  const costTypeParam = searchParams.get("costType"); // одно значение cost_type или 'any'
  const ageMin = searchParams.get("ageMin") ? Number(searchParams.get("ageMin")) : null;
  const ageMax = searchParams.get("ageMax") ? Number(searchParams.get("ageMax")) : null;
  const genderParam = searchParams.get("gender"); // 'male' | 'female' | null (нет фильтра)

  const currentUser = await getCurrentUser();
  const admin = createAdminClient();

  let city = searchParams.get("city");
  let viewerLatitude: number | null = null;
  let viewerLongitude: number | null = null;
  let viewerInterestSlugs: string[] = [];
  let blockedOrganizerIds: string[] = [];

  if (currentUser) {
    const [{ data: profile }, { data: interestRows }, { data: blockRows }] = await Promise.all([
      admin.from("users").select("city").eq("id", currentUser.userId).maybeSingle(),
      admin
        .from("user_interests")
        .select("interests(name)")
        .eq("user_id", currentUser.userId),
      admin
        .from("blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${currentUser.userId},blocked_id.eq.${currentUser.userId}`),
    ]);

    if (!city && profile?.city) city = profile.city;
    viewerInterestSlugs =
      interestRows?.map((r) => (r.interests as unknown as { name: string } | null)?.name).filter(
        (v): v is string => Boolean(v)
      ) ?? [];
    blockedOrganizerIds =
      blockRows?.map((b) =>
        b.blocker_id === currentUser.userId ? b.blocked_id : b.blocker_id
      ) ?? [];
  }

  if (!city) {
    return NextResponse.json({ error: "city_required" }, { status: 400 });
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  let query = admin
    .from("events")
    .select(
      `
      id, title, description, city, latitude, longitude, place_name, address,
      event_date, event_time, seats_total, seats_taken, boosted_at, created_at, cost_type,
      category:categories(slug, name, emoji),
      training_type:training_types(slug, name, emoji),
      organizer:users(id, name, avatar_url, birth_date, gender, rating_avg, completed_meetings_count)
      `
    )
    .eq("status", "published")
    .eq("city", city)
    .gte("event_date", todayIso)
    .order("event_date", { ascending: true })
    .limit(CANDIDATE_POOL_SIZE);

  if (categorySlugsParam) {
    const slugs = categorySlugsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (slugs.length > 0) {
      const { data: categoryRows } = await admin.from("categories").select("id").in("slug", slugs);
      const ids = (categoryRows ?? []).map((c) => c.id);
      if (ids.length > 0) query = query.in("category_id", ids);
    }
  } else if (categorySlug) {
    const { data: category } = await admin
      .from("categories")
      .select("id")
      .eq("slug", categorySlug)
      .maybeSingle();
    if (category) query = query.eq("category_id", category.id);
  }

  if (typeSlug) {
    const { data: trainingType } = await admin
      .from("training_types")
      .select("id")
      .eq("slug", typeSlug)
      .maybeSingle();
    if (trainingType) query = query.eq("training_type_id", trainingType.id);
  }

  if (costTypeParam && costTypeParam !== "any") {
    query = query.eq("cost_type", costTypeParam);
  }

  // Дата: конкретный день, либо "выходные" (ближайшие сб/вс от сегодня).
  if (dateFilter === "today") {
    query = query.eq("event_date", todayIso);
  } else if (dateFilter === "tomorrow") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    query = query.eq("event_date", tomorrow.toISOString().slice(0, 10));
  } else if (dateFilter === "weekend") {
    const { from, to } = getUpcomingWeekendRange();
    query = query.gte("event_date", from).lte("event_date", to);
  } else if (dateFilter && dateFilter !== "any" && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
    query = query.eq("event_date", dateFilter);
  }

  // Время суток: утро/день/вечер по времени начала встречи.
  if (timeOfDay === "morning") {
    query = query.gte("event_time", "05:00:00").lt("event_time", "12:00:00");
  } else if (timeOfDay === "day") {
    query = query.gte("event_time", "12:00:00").lt("event_time", "18:00:00");
  } else if (timeOfDay === "evening") {
    query = query.gte("event_time", "18:00:00").lt("event_time", "23:59:59");
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error("GET /api/events — ошибка запроса к Supabase:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  let visibleRows = (rows ?? []).filter(
    (row) => !blockedOrganizerIds.includes((row.organizer as unknown as { id: string } | null)?.id ?? "")
  );

  // Возраст организатора — фильтруется на нашей стороне (не в SQL), т.к.
  // считается из birth_date, а кандидатов и так не более CANDIDATE_POOL_SIZE.
  if (ageMin !== null || ageMax !== null) {
    visibleRows = visibleRows.filter((row) => {
      const organizer = row.organizer as unknown as { birth_date: string } | null;
      if (!organizer) return false;
      const age = calculateAge(organizer.birth_date);
      if (ageMin !== null && age < ageMin) return false;
      if (ageMax !== null && age > ageMax) return false;
      return true;
    });
  }

  if (genderParam === "male" || genderParam === "female") {
    visibleRows = visibleRows.filter((row) => {
      const organizer = row.organizer as unknown as { gender: string | null } | null;
      return organizer?.gender === genderParam;
    });
  }

  // Подтягиваем активные подписки организаторов одним запросом — для planCoefficient в ranking.
  const organizerIds = Array.from(
    new Set(visibleRows.map((r) => (r.organizer as unknown as { id: string } | null)?.id).filter(Boolean))
  ) as string[];

  const { data: activeSubs } = organizerIds.length
    ? await admin
        .from("subscriptions")
        .select("user_id, plan")
        .in("user_id", organizerIds)
        .eq("status", "active")
    : { data: [] as { user_id: string; plan: SubscriptionPlan }[] };

  const planByOrganizer = new Map<string, SubscriptionPlan>(
    (activeSubs ?? []).map((s) => [s.user_id, s.plan as SubscriptionPlan])
  );

  const now = new Date();
  const scorable: (EventForScoring & { _row: (typeof visibleRows)[number] })[] = visibleRows.map((row) => {
    const category = row.category as unknown as { slug: string } | null;
    const trainingType = row.training_type as unknown as { slug: string } | null;
    const organizer = row.organizer as unknown as { id: string } | null;
    return {
      id: row.id,
      createdAt: row.created_at,
      eventDate: row.event_date,
      eventTime: row.event_time,
      seatsTotal: row.seats_total,
      seatsTaken: row.seats_taken,
      boostedAt: row.boosted_at,
      organizerPlan: organizer ? planByOrganizer.get(organizer.id) ?? null : null,
      categorySlug: category?.slug ?? "",
      trainingTypeSlug: trainingType?.slug ?? null,
      latitude: row.latitude,
      longitude: row.longitude,
      _row: row,
    };
  });

  const ranked = rankEvents(scorable, {
    now,
    viewerLatitude,
    viewerLongitude,
    viewerInterestSlugs,
  });

  const pageStart = page * PAGE_SIZE;
  const pageItems = ranked.slice(pageStart, pageStart + PAGE_SIZE).map(({ _row }) => {
    const organizer = _row.organizer as unknown as {
      id: string;
      name: string;
      avatar_url: string | null;
      birth_date: string;
      rating_avg: number;
      completed_meetings_count: number;
    } | null;
    const category = _row.category as unknown as { slug: string; name: string; emoji: string | null } | null;
    const trainingType = _row.training_type as unknown as { slug: string; name: string; emoji: string | null } | null;

    return {
      id: _row.id,
      title: _row.title,
      description: _row.description,
      category,
      trainingType,
      city: _row.city,
      placeName: _row.place_name,
      address: _row.address,
      eventDate: _row.event_date,
      eventTime: _row.event_time,
      seatsTotal: _row.seats_total,
      seatsTaken: _row.seats_taken,
      costType: _row.cost_type,
      organizer: organizer
        ? {
            id: organizer.id,
            name: organizer.name,
            avatarUrl: organizer.avatar_url,
            age: calculateAge(organizer.birth_date),
            ratingAvg: organizer.rating_avg,
            completedMeetingsCount: organizer.completed_meetings_count,
          }
        : null,
    };
  });

  return NextResponse.json({
    items: pageItems,
    page,
    hasMore: pageStart + PAGE_SIZE < ranked.length,
  });
}

function calculateAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/** Диапазон ближайших выходных: если сегодня сб/вс — начиная с сегодня, иначе следующие сб-вс. */
function getUpcomingWeekendRange(): { from: string; to: string } {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = вс, 6 = сб

  if (dayOfWeek === 0) {
    const iso = today.toISOString().slice(0, 10);
    return { from: iso, to: iso };
  }

  const daysUntilSaturday = dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + daysUntilSaturday);
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  return { from: saturday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

/**
 * POST /api/events
 * Создание встречи. Проверка подписки и лимита — ВСЕГДА на сервере
 * (п.26 ТЗ: "нельзя позволять frontend обходить ограничения"), даже если
 * фронтенд уже проверял то же самое для UX.
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Админ (ADMIN_TELEGRAM_IDS) тестирует приложение без ограничений подписки —
  // ни одна проверка лимитов ниже к нему не применяется. Обычные пользователи
  // по-прежнему проходят полную проверку на сервере, как и раньше (п.26 ТЗ).
  const isAdmin = isAdminTelegramId(currentUser.telegramId);

  const subscriptionInfo = await getActiveSubscriptionInfo(admin, currentUser.userId);
  if (!isAdmin) {
    if (!subscriptionInfo) {
      return NextResponse.json({ error: "subscription_required" }, { status: 402 });
    }

    if (!canCreateMoreEvents(subscriptionInfo.plan, subscriptionInfo.eventsCreatedCount)) {
      return NextResponse.json({ error: "events_limit_reached" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => null);
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const input = parsed.data;

  const groupMax = subscriptionInfo ? PLAN_LIMITS[subscriptionInfo.plan].groupMax : PLAN_LIMITS.premium.groupMax;
  if (!isAdmin && input.seatsTotal > groupMax) {
    return NextResponse.json(
      { error: "group_size_exceeds_plan", groupMax },
      { status: 422 }
    );
  }

  const { data: category } = await admin
    .from("categories")
    .select("id")
    .eq("slug", input.categorySlug)
    .maybeSingle();
  if (!category) {
    return NextResponse.json({ error: "invalid_category" }, { status: 422 });
  }

  let trainingTypeId: string | null = null;
  if (input.categorySlug === "training") {
    if (!input.trainingTypeSlug) {
      return NextResponse.json({ error: "training_type_required" }, { status: 422 });
    }
    const { data: trainingType } = await admin
      .from("training_types")
      .select("id")
      .eq("slug", input.trainingTypeSlug)
      .maybeSingle();
    if (!trainingType) {
      return NextResponse.json({ error: "invalid_training_type" }, { status: 422 });
    }
    trainingTypeId = trainingType.id;
  }

  const { data: organizerProfile } = await admin
    .from("users")
    .select("city")
    .eq("id", currentUser.userId)
    .maybeSingle();

  const { data: createdEvent, error: insertError } = await admin
    .from("events")
    .insert({
      organizer_id: currentUser.userId,
      category_id: category.id,
      training_type_id: trainingTypeId,
      title: input.title,
      description: input.description,
      city: organizerProfile?.city ?? "",
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      place_name: input.placeName,
      address: input.address,
      event_date: input.eventDate,
      event_time: input.eventTime,
      seats_total: input.seatsTotal,
      seats_taken: 0,
      cost_type: input.costType,
      status: "published",
    })
    .select("id")
    .single();

  if (insertError || !createdEvent) {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  await admin.from("event_members").insert({
    event_id: createdEvent.id,
    user_id: currentUser.userId,
    role: "organizer",
  });

  // Если у админа нет реальной подписки (типичный случай при тестировании),
  // subscriptionInfo будет null — увеличивать счётчик использования нечего.
  if (subscriptionInfo) {
    await incrementEventsCreated(admin, subscriptionInfo.subscriptionId, subscriptionInfo.currentPeriodStart);
  }

  // Workflow 1 (п.27 ТЗ): находим потенциально релевантных пользователей —
  // та же логика интересов, что и в ranking (lib/scoring), но здесь как
  // одноразовый список получателей для n8n, а не как скоринг.
  notifyRelevantUsers(admin, {
    eventId: createdEvent.id,
    organizerId: currentUser.userId,
    city: organizerProfile?.city ?? "",
    categorySlug: input.categorySlug,
    trainingTypeSlug: input.trainingTypeSlug ?? null,
    title: input.title,
  }).catch(() => {});

  return NextResponse.json({ status: "created", eventId: createdEvent.id });
}

async function notifyRelevantUsers(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    eventId: string;
    organizerId: string;
    city: string;
    categorySlug: string;
    trainingTypeSlug: string | null;
    title: string;
  }
) {
  // "Релевантные пользователи" — те, у кого в интересах есть название
  // категории или типа тренировки, живут в том же городе, не заблокированы
  // организатором и не он сам.
  const interestNames = [params.categorySlug, params.trainingTypeSlug].filter(Boolean) as string[];
  if (interestNames.length === 0) return;

  const { data: matchingInterests } = await admin.from("interests").select("id, name");
  const relevantInterestIds = (matchingInterests ?? [])
    .filter((i) => interestNames.some((n) => i.name.toLowerCase().includes(n.toLowerCase())))
    .map((i) => i.id);
  if (relevantInterestIds.length === 0) return;

  const { data: candidateRows } = await admin
    .from("user_interests")
    .select("user_id, users!inner(id, telegram_id, city)")
    .in("interest_id", relevantInterestIds);

  const { data: blocks } = await admin
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${params.organizerId},blocked_id.eq.${params.organizerId}`);
  const blockedIds = new Set(
    (blocks ?? []).map((b) => (b.blocker_id === params.organizerId ? b.blocked_id : b.blocker_id))
  );

  const recipients = Array.from(
    new Map(
      (candidateRows ?? [])
        .map((r) => r.users as unknown as { id: string; telegram_id: number; city: string } | null)
        .filter(
          (u): u is { id: string; telegram_id: number; city: string } =>
            !!u && u.id !== params.organizerId && u.city === params.city && !blockedIds.has(u.id)
        )
        .map((u) => [u.id, u.telegram_id])
    ).values()
  );

  if (recipients.length === 0) return;

  await notifyN8n("event-created", {
    eventId: params.eventId,
    title: params.title,
    telegramIds: recipients,
  });
}
ENDOFFILE

mkdir -p "app/(app)/search"
cat > "app/(app)/search/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { EventCard, type EventCardData } from "@/components/feed/EventCard";

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

  function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("city", city);
    if (selectedCategorySlugs.length > 0) params.set("categories", selectedCategorySlugs.join(","));
    if (dateFilter !== "any") params.set("date", dateFilter);
    if (timeFilter !== "any") params.set("timeOfDay", timeFilter);
    if (costFilter !== "any") params.set("costType", costFilter);
    if (ageMin) params.set("ageMin", ageMin);
    if (ageMax) params.set("ageMax", ageMax);
    if (genderFilter !== "any") params.set("gender", genderFilter);

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
        <input
          value={cityInput}
          onChange={(e) => setCityInput(e.target.value)}
          onBlur={() => cityInput.trim() && setCity(cityInput.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter" && cityInput.trim()) setCity(cityInput.trim());
          }}
          placeholder="Город"
          className="flex-1 rounded-pill border border-lavender-200 bg-white px-4 py-2.5 text-base outline-none focus:border-accent"
        />
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

