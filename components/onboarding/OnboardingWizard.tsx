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
  const [agreedToTerms, setAgreedToTerms] = useState(false);

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
            agreedToTerms,
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
    <div
      className="flex min-h-screen flex-col bg-cover bg-center px-5 pb-8 pt-6"
      style={{ backgroundImage: "url(/brand/backgrounds/gradient-bg.jpg)" }}
    >
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
          <Button onClick={handleSubmit} disabled={submitting || !agreedToTerms}>
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
