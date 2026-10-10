"use client";

import { useEffect, useRef, useState } from "react";
import { AliveStage, type StageProp } from "@/components/brand/AliveStage";
import { Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/Icon";
import { peek } from "@/lib/mosya/peek";
import { startGuideTour } from "@/lib/mosya/guide";
import { Button } from "@/components/ui/Button";
import { StepProgress } from "@/components/ui/StepProgress";
import { CityPicker } from "@/components/ui/CityPicker";
import { getInitData } from "@/lib/telegram/webapp-client";
import { resizeImageFile } from "@/lib/photos/resize-image-client";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { BirthDatePicker, isCompleteBirthDate } from "./BirthDatePicker";

interface Interest {
  id: string;
  name: string;
  emoji: string | null;
}

type Step = "photo" | "name" | "birthDate" | "gender" | "city" | "bio" | "interests" | "review";
const STEPS: Step[] = ["photo", "name", "birthDate", "gender", "city", "bio", "interests", "review"];

/** Вводные слайды: живой Мося гуляет среди эмодзи-персонажей и трогает их. */
const INTRO: { title: React.ReactNode; text: string; props: StageProp[] }[] = [
  {
    title: (
      <>
        Есть куда пойти.
        <br />
        Найдём, <span className="m-em">с кем</span>
      </>
    ),
    text: "Встречи с людьми рядом: кофе, спорт, кино, прогулки. Нажми «Я иду» — организатор примет заявку.",
    props: [
      ["Облачко", 62, 316, 112, "flower", "sky", "smile"],
      ["Подушка", 328, 318, 108, "squ", "pink", "calm"],
      ["Искра", 150, 150, 92, "star", "peach", "sly"],
      ["Пузырь", 262, 140, 86, "ball", "lilac", "wow"],
    ],
  },
  {
    title: (
      <>
        Смотри, <span className="m-em">кто идёт</span>,
        <br />
        ещё до заявки
      </>
    ),
    text: "У каждого профиль с фото, интересами и отзывами. Сразу видно, с кем будет интересно.",
    props: [
      ["Клевер", 62, 318, 108, "clover", "violet", "wow"],
      ["Туча", 328, 316, 112, "cloud", "mint", "smile"],
      ["Капля", 148, 146, 90, "blob", "pink", "wow"],
      ["Цветок", 262, 150, 88, "flower", "peach", "calm"],
    ],
  },
  {
    title: (
      <>
        Своя встреча
        <br />
        <span className="m-em">за одну минуту</span>
      </>
    ),
    text: "Можно анонимно. Выбери место и время — компания соберётся сама.",
    props: [
      ["Цветок", 62, 316, 110, "flower", "peach", "smile"],
      ["Пузырь", 328, 318, 104, "ball", "lilac", "calm"],
      ["Искра", 150, 146, 94, "star", "peach", "sly"],
      ["Подушка", 264, 150, 84, "squ", "pink", "smile"],
    ],
  },
];

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
  const [intro, setIntro] = useState(0);
  if (intro < INTRO.length) {
    return <IntroSlides index={intro} onNext={() => setIntro((i) => i + 1)} onSkip={() => setIntro(INTRO.length)} />;
  }
  return <RegistrationSteps />;
}

function IntroSlides({ index, onNext, onSkip }: { index: number; onNext: () => void; onSkip: () => void }) {
  // Слайды листаются сами каждые 4,2 с, как в прототипе; «Далее» — вручную.
  useEffect(() => {
    if (index >= INTRO.length - 1) return;
    const t = setTimeout(onNext, 4200);
    return () => clearTimeout(t);
  }, [index, onNext]);
  const slide = INTRO[index];
  return (
    <div className="m-aurora fixed inset-0 overflow-hidden">
      <div className="absolute inset-x-5 top-[max(14px,env(safe-area-inset-top))] z-10 grid gap-4">
        <div className="m-bars">
          {INTRO.map((_, i) => (
            <i key={i} className={i < index ? "dn" : i === index ? "run" : ""}>
              <b key={index} />
            </i>
          ))}
        </div>
        <Wordmark height={26} color="#16121F" />
      </div>

      <AliveStage key={index} props={slide.props} floor={372} height={390} style={{ top: 92 }} />

      <div className="m-glass-2 m-sheet-in absolute inset-x-0 bottom-0 z-10 rounded-t-[32px] px-5 pb-[max(22px,env(safe-area-inset-bottom))] pt-6">
        <div key={index} className="m-stagger">
          <h1 className="m-title">{slide.title}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{slide.text}</p>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button type="button" onClick={onSkip} className="h-14 px-4 text-[15px] text-ink-400">
            Пропустить
          </button>
          <button type="button" onClick={onNext} className="m-btn m-btn-k flex-1">
            {index < INTRO.length - 1 ? "Далее" : "Начать"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RegistrationSteps() {
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

  // Мося объясняет сбоку, не закрывая форму (только при первом показе шага).
  const said = useRef(new Set<Step>());
  useEffect(() => {
    if (said.current.has(step)) return;
    said.current.add(step);
    const lines: Partial<Record<Step, [Parameters<typeof peek>[0]["pose"], string]>> = {
      photo: ["wave", "Привет! Знаю, регистрация — скучно, она есть во всех сервисах. Но без неё я не смогу найти тебе компанию или собрать встречу. Тут пара секунд 🙌"],
      interests: ["think", "Отметь, что нравится, — по этому я подберу встречи и людей, с которыми тебе будет интересно"],
      review: ["glasses", "Проверь, всё ли верно. Поменять можно потом в профиле"],
    };
    const l = lines[step];
    if (!l) return;
    const t = setTimeout(() => peek({ pose: l[0], text: l[1], low: true, ms: step === "photo" ? 7000 : 5500 }), 450);
    return () => clearTimeout(t);
  }, [step]);

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
      if (!isCompleteBirthDate(birthDate)) return "Выбери день, месяц и год рождения.";
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
        startGuideTour();
        setError(
          `Профиль создан! ${apiErrorText({ error: data.photoError }, "Фото загрузить не получилось.")} Добавить фото можно в профиле.`
        );
        setTimeout(() => {
          window.location.href = afterOnboardingPath();
        }, 3500);
        return;
      }

      startGuideTour();
      window.location.href = afterOnboardingPath();
    } catch {
      setError("Проблема с соединением. Попробуй ещё раз.");
      setSubmitting(false);
    }
  }

  const canGoNext =
    (step === "photo") ||
    (step === "name" && name.trim().length >= 2) ||
    (step === "birthDate" && isCompleteBirthDate(birthDate)) ||
    (step === "gender" && gender !== null) ||
    (step === "city" && city.trim().length >= 2) ||
    (step === "bio") ||
    (step === "interests");

  return (
    <div className="m-aurora flex min-h-[100dvh] flex-col px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6">
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
            <label className="m-glass m-press relative mx-auto flex aspect-square w-40 cursor-pointer items-center justify-center overflow-hidden rounded-[36px]">
              {photoBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoBase64} alt="Фото профиля" className="h-full w-full object-cover" />
              ) : photoLoading ? (
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-lavender-100 border-t-accent" />
              ) : (
                <span className="grid justify-items-center gap-1 text-accent">
                  <Icon name="camera" size={34} />
                  <span className="text-xs font-medium">Добавить фото</span>
                </span>
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
              className="m-glass w-full rounded-[22px] border-0 px-5 py-4 text-base outline-none focus:shadow-[inset_0_0_0_2px_#9B5CFF]"
            />
          </StepBlock>
        )}

        {step === "birthDate" && (
          <StepBlock title="Дата рождения" subtitle="Сервис доступен пользователям 18+.">
            <BirthDatePicker value={birthDate} onChange={setBirthDate} />
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
                  className={`m-press flex-1 rounded-[22px] p-5 text-center text-base font-medium transition ${
                    gender === value ? "bg-ink-900 text-white" : "m-glass text-ink-900"
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
              className="m-glass w-full rounded-[22px] border-0 px-5 py-4 text-base outline-none focus:shadow-[inset_0_0_0_2px_#9B5CFF]"
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
              className="m-glass w-full resize-none rounded-[22px] border-0 px-5 py-4 text-base outline-none focus:shadow-[inset_0_0_0_2px_#9B5CFF]"
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
                    className={`m-press rounded-pill px-4 py-2.5 text-sm font-medium transition ${
                      selected ? "bg-brand-gradient text-white shadow-cta" : "m-glass text-ink-900"
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
            <div className="m-glass space-y-2 rounded-[24px] p-5">
              <ReviewRow label="Имя" value={name} />
              <ReviewRow label="Дата рождения" value={isCompleteBirthDate(birthDate) ? birthDate.split("-").reverse().join(".") : birthDate} />
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
        <div role="alert" className="m-pop mb-3 rounded-[18px] bg-white/85 px-4 py-3 text-center text-sm font-medium text-[#D6336C] shadow-card">
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
    <div className="m-fade-in space-y-4">
      <div key={title} className="m-stagger text-center">
        <h1 className="m-title">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-ink-600">{subtitle}</p>}
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
