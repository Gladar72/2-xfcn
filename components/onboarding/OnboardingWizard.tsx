"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StepProgress } from "@/components/ui/StepProgress";
import { CityPicker } from "@/components/ui/CityPicker";
import { getInitData } from "@/lib/telegram/webapp-client";
import { resizeImageFile } from "@/lib/photos/resize-image-client";
import { apiErrorText } from "@/lib/validation/api-error-text";

interface Interest {
  id: string;
  name: string;
  emoji: string | null;
}

type Step = "photo" | "name" | "birthDate" | "gender" | "city" | "bio" | "interests" | "review";
const STEPS: Step[] = ["photo", "name", "birthDate", "gender", "city", "bio", "interests", "review"];

/** Куда вести после анкеты: на встречу, если человек пришёл по ссылке на неё (см. app/page.tsx), иначе в ленту. */
function afterOnboardingPath(): string {
  try {
    const path = sessionStorage.getItem("mesto_after_onboarding");
    sessionStorage.removeItem("mesto_after_onboarding");
    if (path && /^\/events\/[0-9a-f-]{36}$/.test(path)) return path;
  } catch {
    /* хранилище недоступно */
  }
  return "/feed";
}

export function OnboardingWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [photoBase64, setPhotoBase64] = useState<string | undefined>();
  // Фото подставлено из Telegram автоматически (а не выбрано вручную).
  const [photoFromTelegram, setPhotoFromTelegram] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [selectedInterestIds, setSelectedInterestIds] = useState<string[]>([]);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Аватарка из Telegram: если она есть — сразу показываем на шаге «Фото»,
  // человек может заменить её своей. Если нет (или скрыта приватностью) —
  // как раньше, загружает сам.
  useEffect(() => {
    const initData = getInitData();
    if (!initData) return;
    let cancelled = false;
    setPhotoLoading(true);
    fetch("/api/telegram/profile-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    })
      .then((r) => r.json())
      .then((data: { photo?: string | null }) => {
        if (cancelled || !data.photo) return;
        setPhotoBase64((current) => {
          if (current) return current; // уже выбрал своё — не перетираем
          setPhotoFromTelegram(true);
          return data.photo ?? undefined;
        });
      })
      .catch(() => {})
      .finally(() => !cancelled && setPhotoLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetch("/api/interests")
      .then((r) => r.json())
      .then((data) => setInterests(data.interests ?? []))
      .catch(() => setInterests([]));
  }, []);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  function goNext() {
    // Если на шаге чего-то не хватает — говорим, чего именно, а не просто
    // держим кнопку серой.
    const hint = stepHint();
    if (hint) {
      setError(hint);
      return;
    }
    setError(null);
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
  }

  /** Что не так на текущем шаге (null — всё в порядке). */
  function stepHint(): string | null {
    if (step === "name" && name.trim().length < 2) return "Напиши имя — минимум 2 буквы.";
    if (step === "birthDate") {
      if (!birthDate) return "Укажи дату рождения.";
      if (!isAtLeast18(birthDate)) return "Сервис доступен только с 18 лет.";
    }
    if (step === "gender" && gender === null) return "Выбери пол.";
    if (step === "city" && city.trim().length < 2) return "Выбери город из списка.";
    return null;
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
    resizeImageFile(file, 1600, 0.82).then((dataUrl) => {
      setPhotoBase64(dataUrl);
      setPhotoFromTelegram(false);
    });
  }

  async function handleSubmit() {
    if (!agreedToTerms) {
      setError("Отметь галочку — нужно согласие с условиями оферты и политикой конфиденциальности.");
      return;
    }
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
            agreedToTerms,
            city,
            bio,
            interestIds: selectedInterestIds,
            photoBase64,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "already_registered") {
          window.location.href = "/";
          return;
        }
        // Сервер говорит, что именно не так — показываем и открываем нужный шаг.
        setError(apiErrorText(data, "Не получилось сохранить профиль. Попробуй ещё раз.", res.status));
        const fieldStep: Partial<Record<string, Step>> = {
          name: "name",
          birthDate: "birthDate",
          gender: "gender",
          city: "city",
          bio: "bio",
          interestIds: "interests",
          photoBase64: "photo",
        };
        const target = typeof data.field === "string" ? fieldStep[data.field] : undefined;
        if (target) setStepIndex(STEPS.indexOf(target));
        setSubmitting(false);
        return;
      }

      // Профиль создан, но фото не подошло — говорим об этом, а не молчим.
      if (data.photoError) {
        setError(
          `Профиль создан! ${apiErrorText({ error: data.photoError }, "Фото загрузить не получилось.")} Добавить фото можно в профиле.`
        );
        setTimeout(() => {
          window.location.href = afterOnboardingPath();
        }, 3500);
        return;
      }

      window.location.href = afterOnboardingPath();
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
          <StepBlock
            title={photoFromTelegram ? "Твоё фото" : "Добавь фото"}
            subtitle={
              photoFromTelegram
                ? "Взяли аватарку из Telegram. Нажми на фото, чтобы выбрать другое."
                : photoLoading
                  ? "Ищем твою аватарку в Telegram…"
                  : "Можно пропустить и добавить позже, в профиле."
            }
          >
            <label className="flex aspect-square w-40 mx-auto items-center justify-center overflow-hidden rounded-full bg-white shadow-card">
              {photoBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoBase64} alt="Фото профиля" className="h-full w-full object-cover" />
              ) : photoLoading ? (
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-lavender-100 border-t-accent" />
              ) : (
                <Image src="/brand/3d/icon-camera.png" alt="" width={44} height={44} />
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
              className="w-full rounded-card border border-ink-400/20 bg-white px-5 py-4 text-base outline-none focus:border-accent"
            />
          </StepBlock>
        )}

        {step === "birthDate" && (
          <StepBlock title="Дата рождения" subtitle="Сервис доступен пользователям 18+.">
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full rounded-card border border-ink-400/20 bg-white px-5 py-4 text-base outline-none focus:border-accent"
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
              className="w-full rounded-card border border-ink-400/20 bg-white px-5 py-4 text-base outline-none focus:border-accent"
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
              className="w-full resize-none rounded-card border border-ink-400/20 bg-white px-5 py-4 text-base outline-none focus:border-accent"
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

            <label className="mt-4 flex items-start gap-2 text-xs text-ink-600">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
              />
              <span>
                Я принимаю условия{" "}
                <a href="/legal/offer" target="_blank" className="text-accent underline">
                  публичной оферты
                </a>{" "}
                и{" "}
                <a href="/legal/privacy" target="_blank" className="text-accent underline">
                  политики конфиденциальности
                </a>
              </span>
            </label>
          </StepBlock>
        )}

      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-card bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        {stepIndex > 0 && (
          <Button variant="secondary" onClick={goBack} className="w-auto px-6">
            Назад
          </Button>
        )}
        {!isLastStep ? (
          <Button onClick={goNext} className={canGoNext ? undefined : "opacity-40"}>
            Далее
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting} className={agreedToTerms ? undefined : "opacity-40"}>
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

function isAtLeast18(birthDateIso: string): boolean {
  const birthDate = new Date(birthDateIso);
  if (Number.isNaN(birthDate.getTime())) return false;
  const eighteenYearsAgo = new Date();
  eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
  return birthDate <= eighteenYearsAgo;
}
