"use client";

import { useEffect, useRef, useState } from "react";
import { AliveStage, type StageProp } from "@/components/brand/AliveStage";
import { Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/Icon";
import { peek, say } from "@/lib/mosya/peek";
import { confetti } from "@/lib/mosya/confetti";
import { groupInterests, interestIcon } from "@/lib/data/interests";
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

type Step = "setup" | "interests" | "geo";
const STEPS: Step[] = ["setup", "interests", "geo"];

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
  if (intro === INTRO.length) return <AuthScreen onContinue={() => setIntro(INTRO.length + 1)} />;
  return <RegistrationSteps />;
}

/** «Войти в Место»: в мини-приложении Telegram уже узнал человека — кнопка просто ведёт к анкете. */
function AuthScreen({ onContinue }: { onContinue: () => void }) {
  const props: StageProp[] = [
    ["Искра", 300, 140, 96, "star", "peach", "sly"],
    ["Пузырь", 70, 262, 100, "ball", "lilac", "wow"],
  ];
  return (
    <div className="m-aurora fixed inset-0 overflow-hidden">
      <AliveStage props={props} floor={318} height={330} style={{ top: 44 }} />
      <div className="m-glass-2 m-sheet-in absolute inset-x-0 bottom-0 z-10 rounded-t-[32px] px-5 pb-[max(22px,env(safe-area-inset-bottom))] pt-6">
        <div className="m-stagger">
          <h1 className="m-title">
            Войти в <span className="m-em">Место</span>
          </h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-600">
            Через Telegram быстрее всего: имя и фото подтянутся сами, а встречи из мини-приложения сохранятся.
          </p>
        </div>
        <button type="button" onClick={onContinue} className="m-btn m-btn-tg mt-5">
          <Icon name="tg" size={21} />
          Войти через Telegram
        </button>
        <p className="mt-4 text-center text-[11.5px] leading-snug text-ink-400">
          Продолжая, вы принимаете{" "}
          <a href="/legal/offer" target="_blank" className="underline">
            публичную оферту
          </a>{" "}
          и{" "}
          <a href="/legal/privacy" target="_blank" className="underline">
            политику конфиденциальности
          </a>
        </p>
      </div>
    </div>
  );
}

function IntroSlides({ index, onNext, onSkip }: { index: number; onNext: () => void; onSkip: () => void }) {
  // Слайды листаются сами каждые 4,2 с, как в прототипе; «Далее» — вручную.
  useEffect(() => {
    if (index >= INTRO.length - 1) return;
    const t = setTimeout(onNext, 4200);
    return () => clearTimeout(t);
  }, [index, onNext]);
  const slide = INTRO[index]!;
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
  const [locating, setLocating] = useState(false);

  // Имя сразу из Telegram — человеку остаётся только проверить.
  useEffect(() => {
    try {
      const u = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { first_name?: string } } } } })
        .Telegram?.WebApp?.initDataUnsafe?.user;
      if (u?.first_name) setName((n) => n || u.first_name || "");
    } catch {
      /* нет Telegram — введёт сам */
    }
  }, []);

  // Аватарка из Telegram: если она есть — сразу показываем, человек может заменить её своей.
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
          if (current) return current;
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

  const step: Step = STEPS[stepIndex] ?? "setup";
  const isLastStep = stepIndex === STEPS.length - 1;
  const minInterests = Math.min(3, interests.length);

  // Мося объясняет сбоку, не закрывая форму (только при первом показе шага).
  const said = useRef(new Set<Step>());
  useEffect(() => {
    if (said.current.has(step)) return;
    said.current.add(step);
    const lines: Record<Step, [Parameters<typeof peek>[0]["pose"], string]> = {
      setup: [
        "wave",
        `Привет${name ? ", " + name : ""}! Знаю, регистрация — скучно, она есть во всех сервисах. Но без неё я не смогу найти тебе компанию или собрать встречу. Тут пара секунд 🙌`,
      ],
      interests: ["think", "Отметь хотя бы 3 — по ним я подберу встречи и людей, с которыми тебе будет интересно"],
      geo: ["phone", "Геолокация нужна, чтобы показать, что рядом. Где ты — никому не видно"],
    };
    const l = lines[step];
    const t = setTimeout(() => peek({ pose: l[0], text: l[1], low: true, ms: step === "setup" ? 7000 : 5500 }), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /** Что не так на текущем шаге (null — всё в порядке). */
  function stepHint(): string | null {
    if (step === "setup") {
      if (name.trim().length < 2) return "Напиши имя — минимум 2 буквы.";
      if (!isCompleteBirthDate(birthDate)) return "Выбери день, месяц и год рождения.";
      if (!isAtLeast18(birthDate)) return "Сервис доступен только с 18 лет.";
      if (gender === null) return "Выбери пол.";
    }
    if (step === "interests" && selectedInterestIds.length < minInterests) return `Выбери хотя бы ${minInterests} интереса.`;
    if (step === "geo" && city.trim().length < 2) return "Выбери город — или разреши геолокацию.";
    return null;
  }

  function goNext() {
    const hint = stepHint();
    if (hint) {
      setError(hint);
      say(hint, "think");
      return;
    }
    setError(null);
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
  }

  function goBack() {
    setError(null);
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  function toggleInterest(id: string) {
    setSelectedInterestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    resizeImageFile(file, 1600, 0.82).then((dataUrl) => {
      setPhotoBase64(dataUrl);
      setPhotoFromTelegram(false);
    });
  }

  /** Геолокация → город (обратным геокодированием). Точка никуда не сохраняется. */
  function detectCity() {
    if (!navigator.geolocation) {
      setError("Геолокация недоступна — выбери город вручную.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/geocode?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
          const data = await res.json().catch(() => ({}));
          const found = typeof data.address === "string" ? cityFromAddress(data.address) : null;
          if (found) {
            setCity(found);
            setError(null);
          } else setError("Не получилось определить город — выбери его вручную.");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setError("Без доступа к геолокации — просто выбери город ниже.");
      },
      { timeout: 8000, maximumAge: 600000 }
    );
  }

  async function handleSubmit() {
    const hint = stepHint();
    if (hint) {
      setError(hint);
      return;
    }
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
          profile: { name, birthDate, gender, agreedToTerms, city, bio, interestIds: selectedInterestIds, photoBase64 },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "already_registered") {
          window.location.href = "/";
          return;
        }
        setError(apiErrorText(data, "Не получилось сохранить профиль. Попробуй ещё раз.", res.status));
        const fieldStep: Partial<Record<string, Step>> = {
          name: "setup",
          birthDate: "setup",
          gender: "setup",
          bio: "setup",
          photoBase64: "setup",
          interestIds: "interests",
          city: "geo",
        };
        const target = typeof data.field === "string" ? fieldStep[data.field] : undefined;
        if (target) setStepIndex(STEPS.indexOf(target));
        setSubmitting(false);
        return;
      }

      startGuideTour();
      if (data.photoError) {
        setError(
          `Профиль создан! ${apiErrorText({ error: data.photoError }, "Фото загрузить не получилось.")} Добавить фото можно в профиле.`
        );
        setTimeout(() => {
          window.location.href = afterOnboardingPath();
        }, 3500);
        return;
      }
      confetti();
      setTimeout(() => {
        window.location.href = afterOnboardingPath();
      }, 700);
    } catch {
      setError("Проблема с соединением. Попробуй ещё раз.");
      setSubmitting(false);
    }
  }

  const grouped = groupInterests(interests);

  return (
    <div className="m-aurora flex min-h-[100dvh] flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
      <div className="flex items-center gap-3">
        {stepIndex > 0 && (
          <button onClick={goBack} aria-label="Назад" className="m-glass m-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
            <Icon name="back" size={22} />
          </button>
        )}
        <div className="flex-1">
          <StepProgress currentStep={stepIndex + 1} totalSteps={STEPS.length} />
        </div>
      </div>

      <div key={step} className="m-fade-in flex flex-1 flex-col gap-4 pb-4 pt-5">
        {step === "setup" && (
          <>
            <div className="m-stagger">
              <h1 className="m-title">
                Почти готово{name.trim() ? ", " : ""}
                <span className="m-em">{name.trim()}</span>
              </h1>
              <p className="mt-1.5 text-[13.5px] leading-snug text-ink-600">
                {photoFromTelegram
                  ? "Имя и фото взяли из Telegram. Нажми на фото, чтобы выбрать другое."
                  : photoLoading
                    ? "Ищем твою аватарку в Telegram…"
                    : "Добавь фото — с ним чаще зовут на встречи."}
              </p>
            </div>

            <label className="m-press relative flex h-[104px] w-[104px] cursor-pointer items-center justify-center overflow-hidden rounded-[28px] bg-brand-gradient text-white shadow-cta">
              {photoBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoBase64} alt="Фото профиля" className="h-full w-full object-cover" />
              ) : photoLoading ? (
                <div className="h-9 w-9 animate-spin rounded-full border-4 border-white/40 border-t-white" />
              ) : (
                <span className="grid justify-items-center gap-1">
                  <Icon name="camera" size={30} />
                  <span className="text-[11px] font-medium">Фото</span>
                </span>
              )}
              {photoFromTelegram && (
                <span className="absolute bottom-1.5 left-1.5 rounded-pill bg-white/85 px-2 py-0.5 text-[10px] font-medium text-ink-900">
                  из Telegram
                </span>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </label>

            <Field label="Имя">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" maxLength={50} className={fieldClass} />
            </Field>
            <Field label="Дата рождения" hint="18+">
              <BirthDatePicker value={birthDate} onChange={setBirthDate} />
            </Field>
            <Field label="Пол">
              <div className="flex gap-2">
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
                    className={`m-press h-12 flex-1 rounded-pill text-[15px] font-medium transition ${
                      gender === value ? "bg-ink-900 text-white" : "m-glass text-ink-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="О себе" hint="необязательно">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Пару слов о себе — до 300 символов"
                className={`${fieldClass} resize-none`}
              />
            </Field>
          </>
        )}

        {step === "interests" && (
          <>
            <div className="m-stagger">
              <h1 className="m-title">
                Что тебе <span className="m-em">по душе?</span>
              </h1>
              <p className="mt-1.5 text-[13.5px] leading-snug text-ink-600">
                Выбери хотя бы три. По ним подберём встречи и людей с похожими интересами.
              </p>
            </div>
            {grouped.map((g) => {
              const n = g.items.filter((x) => selectedInterestIds.includes(x.id)).length;
              return (
                <div key={g.title}>
                  <h3 className="mb-2 flex items-center justify-between text-[13px] font-medium text-ink-600">
                    {g.title}
                    {n > 0 && <span className="text-accent">{n}</span>}
                  </h3>
                  <div className="m-stagger grid grid-cols-3 gap-2">
                    {g.items.map((interest) => {
                      const selected = selectedInterestIds.includes(interest.id);
                      return (
                        <button
                          key={interest.id}
                          type="button"
                          onClick={() => toggleInterest(interest.id)}
                          className={`m-cat relative ${
                            selected
                              ? "bg-white/90 shadow-[inset_0_0_0_2px_#9B5CFF,0_12px_24px_-16px_rgba(130,60,255,.8)]"
                              : "m-glass"
                          }`}
                        >
                          {selected && (
                            <span className="m-pop absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand-gradient text-white">
                              <Icon name="check" size={12} strokeWidth={2.6} />
                            </span>
                          )}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={interestIcon(interest.name)} alt="" />
                          <span>{interest.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {step === "geo" && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mosya/mosya_phone.webp" alt="" className="m-pop mb-3 h-36 w-36 object-contain" />
            <h1 className="m-title">
              Где ищем <span className="m-em">компанию?</span>
            </h1>
            <p className="mt-2 max-w-[300px] text-[14px] leading-snug text-ink-600">
              Мося покажет встречи рядом. Геолокация нужна только чтобы определить город.
            </p>
            <button onClick={detectCity} disabled={locating} className="m-btn m-btn-v mt-6">
              <Icon name="nav" size={20} />
              {locating ? "Определяем…" : "Разрешить геолокацию"}
            </button>
            <div className="mt-3 w-full text-left">
              <CityPicker value={city} onChange={setCity} placeholder="Или выбери город" dropdownDirection="up" className={fieldClass} />
            </div>
            <label className="mt-5 flex items-start gap-2 text-left text-xs text-ink-600">
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
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="m-pop mb-3 rounded-[18px] bg-white/85 px-4 py-3 text-center text-sm font-medium text-[#D6336C] shadow-card">
          {error}
        </div>
      )}

      {step === "interests" && (
        <p className="mb-2 text-center text-xs text-ink-400">
          {selectedInterestIds.length < minInterests
            ? `Выбрано ${selectedInterestIds.length} из ${minInterests}`
            : `Выбрано: ${selectedInterestIds.length}`}
        </p>
      )}
      {!isLastStep ? (
        <Button onClick={goNext} className={stepHint() ? "opacity-60" : undefined}>
          Дальше
        </Button>
      ) : (
        <Button onClick={handleSubmit} disabled={submitting} className={agreedToTerms && city ? undefined : "opacity-60"}>
          {submitting ? "Сохраняем..." : "Готово"}
        </Button>
      )}
    </div>
  );
}

const fieldClass =
  "m-glass w-full min-w-0 box-border rounded-[20px] border-0 px-4 py-3.5 text-base outline-none focus:shadow-[inset_0_0_0_2px_#9B5CFF]";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 flex justify-between px-1 text-[12.5px] font-medium text-ink-600">
        {label}
        {hint && <span className="font-normal text-ink-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

/** «Россия, Тюмень, улица Республики, 59» → «Тюмень». */
function cityFromAddress(address: string): string | null {
  const parts = address.split(",").map((p) => p.trim());
  const c = parts[0] === "Россия" ? parts[1] : parts[0];
  return c && c.length >= 2 ? c.replace(/^г\.?\s*/, "") : null;
}

function isAtLeast18(birthDateIso: string): boolean {
  const birthDate = new Date(birthDateIso);
  if (Number.isNaN(birthDate.getTime())) return false;
  const eighteenYearsAgo = new Date();
  eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
  return birthDate <= eighteenYearsAgo;
}
