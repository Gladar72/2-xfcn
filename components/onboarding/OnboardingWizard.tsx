"use client";

import { useEffect, useRef, useState } from "react";
import { type StageProp } from "@/components/brand/AliveStage";
import { Creature } from "@/components/brand/Creature";
import { KI } from "@/components/proto/k";

import { Ic, Sheet } from "@/components/proto/ui";
import { peek, say } from "@/lib/mosya/peek";
import { confetti } from "@/lib/mosya/confetti";
import { groupInterests, interestIcon } from "@/lib/data/interests";
import { startGuideTour } from "@/lib/mosya/guide";
import { getInitData } from "@/lib/telegram/webapp-client";
import { resizeImageFile } from "@/lib/photos/resize-image-client";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { isCompleteBirthDate } from "./BirthDatePicker";
import { CityWheel } from "@/components/proto/pickers";
import { RUSSIAN_CITIES } from "@/lib/data/russian-cities";

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
        Найдём, <em>с кем</em>
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
        Смотри, <em>кто идёт</em>,
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
        <em>за одну минуту</em>
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
  return (
    <div className="P">
      {intro < INTRO.length ? (
        <IntroSlides index={intro} onNext={() => setIntro((i) => i + 1)} onBack={() => setIntro((i) => Math.max(0, i - 1))} />
      ) : intro === INTRO.length ? (
        <AuthScreen onContinue={() => setIntro(INTRO.length + 1)} />
      ) : (
        <RegistrationSteps onBackToAuth={() => setIntro(INTRO.length)} />
      )}
    </div>
  );
}

/** «Войти в Место» (auth прототипа): фото, логотип, одна кнопка Telegram. */
function AuthScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <section className="scr fade K" data-id="auth" style={{ background: "#17141F", color: "#fff" }}>
      <div className="k-abg" aria-hidden style={{ backgroundImage: "url(/brand/auth/auth_bg.webp)" }} />
      <div className="k-ashade" aria-hidden />
      <div className="k-alogo" style={{ top: "34%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/auth/wordmark-white.svg" alt="место" />
        <p>
          Найди <em>компанию</em>
          <br />
          на сегодня
        </p>
      </div>
      <div className="k-abtns" style={{ bottom: "calc(var(--bot) + 24px)" }}>
        <small>Через Telegram быстрее всего — имя и фото подтянутся сами</small>
        <button className="k-btn k-aw k-pr" onClick={onContinue}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
            <path d="M21.5 4.2 2.9 11.4c-1.3.5-1.2 1.3-.2 1.6l4.8 1.5 1.8 5.6c.2.7.4.9.9.9.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.3zM9.6 14.2l-.4 4.1-1.5-4.8 10.6-6.7z" />
          </svg>
          Войти через Telegram
        </button>
        <p className="k-alegal">
          Продолжая, вы принимаете{" "}
          <a href="/legal/offer" target="_blank">
            оферту
          </a>{" "}
          и{" "}
          <a href="/legal/privacy" target="_blank">
            политику конфиденциальности
          </a>
        </p>
      </div>
    </section>
  );
}

/** Слайдер «Далее»: кружок тянется вправо (как «сдвиньте» на айфоне); тап — тоже дальше. */
function SwipeNext({ label, onDone }: { label: string; onDone: () => void }) {
  const tr = useRef<HTMLDivElement>(null);
  const kn = useRef<HTMLButtonElement>(null);
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const st = useRef({ sx: 0, max: 0, dx: 0 });
  const max = () => (tr.current ? tr.current.offsetWidth - 68 : 200);
  return (
    <div
      ref={tr}
      className="k-tr k-g"
      onClick={(e) => {
        if (e.target === tr.current) onDone();
      }}
    >
      <div className="k-fill" style={{ width: 68 + dx, transition: drag ? "none" : "width .5s var(--spring)" }} />
      <button
        ref={kn}
        className="k-kn"
        aria-label={label}
        style={{ transform: `translateX(${dx}px)`, transition: drag ? "none" : "transform .5s var(--spring)" }}
        onPointerDown={(e) => {
          st.current = { sx: e.clientX, max: max(), dx: 0 };
          kn.current?.setPointerCapture(e.pointerId);
          setDrag(true);
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const v = Math.max(0, Math.min(st.current.max, e.clientX - st.current.sx));
          st.current.dx = v;
          setDx(v);
        }}
        onPointerUp={() => {
          if (!drag) return;
          setDrag(false);
          const v = st.current.dx;
          if (v > st.current.max * 0.6) {
            setDx(st.current.max);
            window.setTimeout(() => {
              setDx(0);
              onDone();
            }, 260);
          } else {
            setDx(0);
            if (v < 6) onDone();
          }
        }}
        onPointerCancel={() => {
          setDrag(false);
          setDx(0);
        }}
      >
        <KI n="chev" />
      </button>
      <span className="k-lb" style={{ opacity: 1 - dx / Math.max(1, st.current.max || 200) }} onClick={onDone}>
        {label}
      </span>
      <span className="k-ar" onClick={onDone}>
        ›››
      </span>
    </div>
  );
}

/** Вводные слайды (intro прототипа): логотип, полоски, живой Мося, текст и «Далее». */
function IntroSlides({ index, onNext, onBack }: { index: number; onNext: () => void; onBack: () => void }) {
  useEffect(() => {
    if (index >= INTRO.length - 1) return;
    const t = setTimeout(onNext, 4200);
    return () => clearTimeout(t);
  }, [index, onNext]);
  const slide = INTRO[index]!;
  return (
    <section className="scr fade K k-intro26" data-id="onb">
      <div className="k-pbg" aria-hidden />
      <div className="i26-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/auth/wordmark-dark.svg" alt="место" />
        <span className="i26-bars" aria-hidden>
          {INTRO.map((_, i) => (
            <i key={`${i}-${index}`} className={i < index ? "dn" : i === index ? "run" : ""}>
              <b />
            </i>
          ))}
        </span>
      </div>
      <div className="i26-cr">
        <Creature size={240} variant="e" />
      </div>
      <div className="i26-txt" key={index}>
        <h1>{slide.title}</h1>
        <p>{slide.text}</p>
      </div>
      {/* Как в прототипе: «Назад» и слайдер «Далее» — тянешь кружок вправо, как на айфоне. */}
      <div className="k-slide" style={{ bottom: "calc(var(--bot) + 30px)", left: 20, right: 20 }}>
        <button className="k-bk k-pr" onClick={onBack} aria-label="Назад" style={{ opacity: index > 0 ? 1 : 0.35 }} disabled={index === 0}>
          <KI n="back" />
        </button>
        <SwipeNext label={index < INTRO.length - 1 ? "Далее" : "Начать"} onDone={onNext} />
      </div>
    </section>
  );
}

/** ДД.ММ.ГГГГ → ГГГГ-ММ-ДД (или "" пока не введено целиком). */
function birthIso(v: string) {
  const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
function maskBirth(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join(".");
}

function RegistrationSteps({ onBackToAuth }: { onBackToAuth: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [photoBase64, setPhotoBase64] = useState<string | undefined>();
  const [photoFromTelegram, setPhotoFromTelegram] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [name, setName] = useState("");
  const [birthText, setBirthText] = useState("");
  const birthDate = birthIso(birthText);
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [city, setCity] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [bio, setBio] = useState("");
  const [selectedInterestIds, setSelectedInterestIds] = useState<string[]>([]);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  // Согласие на обработку персональных данных — отдельной галочкой (152-ФЗ, с 01.09.2025 — отдельный документ).
  const [agreedToPd, setAgreedToPd] = useState(false);
  const [locating, setLocating] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  // В какое место сетки добавляем фото: 0 — главное, 1–2 — дополнительные.
  const slotRef = useRef(0);

  useEffect(() => {
    try {
      const u = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { first_name?: string } } } } })
        .Telegram?.WebApp?.initDataUnsafe?.user;
      if (u?.first_name) setName((n) => n || u.first_name || "");
    } catch {
      /* нет Telegram — введёт сам */
    }
  }, []);

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

  // Город по умолчанию — из геолокации позже; пока пусто.
  const step: Step = STEPS[stepIndex] ?? "setup";
  const minInterests = Math.min(3, interests.length);

  const said = useRef(new Set<Step>());
  useEffect(() => {
    if (said.current.has(step)) return;
    said.current.add(step);
    const lines: Record<Step, [Parameters<typeof peek>[0]["pose"], string]> = {
      setup: [
        "wave",
        `Привет${name ? ", " + name : ""}! Знаю, регистрация — скучно, она есть во всех сервисах. Но без неё я не смогу найти тебе компанию или собрать встречу. И обязательно добавь своё фото — без него зарегистрироваться нельзя 📸`,
      ],
      interests: ["think", "Отметь хотя бы 3 — по ним я подберу встречи и людей, с которыми тебе будет интересно"],
      geo: ["phone", "Геолокация нужна, чтобы показать, что рядом. Где ты — никому не видно"],
    };
    const l = lines[step];
    const t = setTimeout(() => peek({ pose: l[0], text: l[1], low: true, ms: step === "setup" ? 7000 : 5500 }), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function stepHint(): string | null {
    if (step === "setup") {
      if (name.trim().length < 2) return "Напиши имя — минимум 2 буквы.";
      if (!isCompleteBirthDate(birthDate)) return "Напиши дату рождения: ДД.ММ.ГГГГ.";
      if (!isAtLeast18(birthDate)) return "Сервис доступен только с 18 лет.";
      if (gender === null) return "Выбери пол.";
      if (!agreedToTerms) return "Отметь галочку — нужно принять условия оферты и политику конфиденциальности.";
      if (!agreedToPd) return "Отметь галочку — нужно согласие на обработку персональных данных.";
      if (!photoBase64) return photoLoading ? "Секунду, ищу твоё фото в Telegram…" : "Добавь своё фото — без него зарегистрироваться нельзя. Люди хотят видеть, с кем идут на встречу.";
    }
    if (step === "interests" && selectedInterestIds.length < minInterests) return `Выбери хотя бы ${minInterests} интереса.`;
    return null;
  }

  function goNext() {
    const hint = stepHint();
    if (hint) {
      say(hint, "think");
      return;
    }
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
  }

  function goBack() {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
    else onBackToAuth();
  }

  function toggleInterest(id: string) {
    setSelectedInterestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function pickPhoto(slot: number) {
    slotRef.current = slot;
    photoInput.current?.click();
  }
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const slot = slotRef.current;
    if (slot === 0) {
      const [first, ...rest] = files;
      resizeImageFile(first!, 1600, 0.9).then((dataUrl) => {
        setPhotoBase64(dataUrl);
        setPhotoFromTelegram(false);
      });
      rest.slice(0, 2).forEach((f) => resizeImageFile(f, 1600, 0.88).then((d) => setExtraPhotos((x) => [...x, d].slice(0, 2))));
      return;
    }
    files.slice(0, 2).forEach((f) => resizeImageFile(f, 1600, 0.88).then((d) => setExtraPhotos((x) => [...x, d].slice(0, 2))));
  }

  /** «Разрешить геолокацию»: город определяется сам, и сразу сохраняем профиль. */
  function detectCityAndFinish() {
    if (!navigator.geolocation) {
      say("Геолокация недоступна — выбери город вручную", "think");
      setCityOpen(true);
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
            handleSubmit(found);
          } else {
            say("Не получилось определить город — выбери его вручную", "think");
            setCityOpen(true);
          }
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        say("Без доступа к геолокации — просто выбери город", "think");
        setCityOpen(true);
      },
      { timeout: 8000, maximumAge: 600000 }
    );
  }

  async function handleSubmit(cityValue = city) {
    if (cityValue.trim().length < 2) {
      setCityOpen(true);
      return;
    }
    setSubmitting(true);
    const initData = getInitData();
    // Вход на сайте (почта / Telegram-виджет): «пропуск» от /login вместо initData.
    let ticket: string | null = null;
    try {
      ticket = sessionStorage.getItem("mesto_reg_ticket");
    } catch {
      ticket = null;
    }
    if (!initData && !ticket) {
      window.location.href = "/login";
      return;
    }
    const profile = { name, birthDate, gender, agreedToTerms, city: cityValue, bio, interestIds: selectedInterestIds, photoBase64, extraPhotos };
    try {
      const res = initData
        ? await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData, profile }),
          })
        : await fetch("/api/auth/mobile/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticket, profile }),
          });
      const data = await res.json().catch(() => ({}));
      if (!initData && res.ok && data.token) {
        // Сессия сайта — в cookie, как у мини-приложения.
        await fetch("/api/auth/web/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: data.token }),
        });
        try {
          sessionStorage.removeItem("mesto_reg_ticket");
        } catch {
          /* ничего */
        }
      }
      if (!initData && res.status === 401) {
        say("Вход устарел — войди заново.", "think");
        setTimeout(() => (window.location.href = "/login"), 1500);
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        if (data.error === "already_registered") {
          window.location.href = "/app";
          return;
        }
        say(apiErrorText(data, "Не получилось сохранить профиль. Попробуй ещё раз.", res.status), "think");
        const fieldStep: Partial<Record<string, Step>> = {
          name: "setup",
          birthDate: "setup",
          gender: "setup",
          bio: "setup",
          photoBase64: "setup",
          interestIds: "interests",
        };
        const target = typeof data.field === "string" ? fieldStep[data.field] : undefined;
        if (target) setStepIndex(STEPS.indexOf(target));
        setSubmitting(false);
        return;
      }
      startGuideTour();
      if (data.photoError) {
        say(`Профиль создан! ${apiErrorText({ error: data.photoError }, "Фото загрузить не получилось.")} Добавить фото можно в профиле.`);
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
      say("Проблема с соединением. Попробуй ещё раз.", "think");
      setSubmitting(false);
    }
  }

  const grouped = groupInterests(interests);
  const prog = (
    <span className="prog">
      {STEPS.map((s, i) => (
        <i key={s} className={i <= stepIndex ? "on" : ""} />
      ))}
    </span>
  );

  if (step === "setup") {
    return (
      <section className="scr aurora in" data-id="setup">
        <div className="scroll" style={{ paddingBottom: 160 }}>
          <div className="bar-top">
            <button className="rb gl" onClick={goBack} aria-label="Назад">
              <Ic n="back" />
            </button>
            {prog}
          </div>
          <h1 className="t" style={{ marginTop: 20 }}>
            Почти готово{name.trim() ? ", " : ""}
            <em>{name.trim()}</em>
          </h1>
          <p className="muted" style={{ margin: "8px 0 14px", fontSize: 15, lineHeight: 1.5 }}>
            {photoFromTelegram
              ? "Имя и фото взяли из Telegram. Добавь ещё 1–2 фото — с ними чаще зовут на встречи."
              : "Добавь 1–3 фото — хотя бы одно обязательно: без фото зарегистрироваться нельзя."}
          </p>
          <div className="phgrid">
            {[0, 1, 2].map((i) => {
              const src = i === 0 ? photoBase64 : extraPhotos[i - 1];
              if (i === 0 && !src)
                return (
                  <button key={i} className="phs gl" onClick={() => pickPhoto(0)} aria-label="Главное фото">
                    <div className="tgava">{(name.trim() || "?").charAt(0).toUpperCase()}</div>
                    <span className="tag">{photoLoading ? "ищем в Telegram…" : "главное"}</span>
                  </button>
                );
              if (src)
                return (
                  <div key={i} className="phs gl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" onClick={() => i === 0 && pickPhoto(0)} />
                    <button
                      className="x"
                      aria-label="Удалить фото"
                      onClick={() => {
                        if (i === 0) {
                          setPhotoBase64(undefined);
                          setPhotoFromTelegram(false);
                        } else setExtraPhotos((x) => x.filter((_, k) => k !== i - 1));
                      }}
                    >
                      <Ic n="close" c="xs" />
                    </button>
                    {i === 0 && <span className="tag">{photoFromTelegram ? "из Telegram" : "главное"}</span>}
                  </div>
                );
              return (
                <button key={i} className="phs gl" onClick={() => pickPhoto(i)} aria-label="Добавить фото">
                  <span className="add">
                    <Ic n="plus" c="s" />
                  </span>
                </button>
              );
            })}
          </div>
          <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={handlePhotoChange} />

          <span className="lbl">Имя</span>
          <label className="field gl">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="Имя" />
          </label>
          <span className="lbl">Дата рождения</span>
          <label className="field gl">
            <input value={birthText} onChange={(e) => setBirthText(maskBirth(e.target.value))} placeholder="ДД.ММ.ГГГГ" inputMode="numeric" maxLength={10} />
          </label>
          <span className="lbl">Пол</span>
          <div className="chs">
            {(
              [
                ["male", "Мужчина"],
                ["female", "Женщина"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} className={gender === v ? "on" : "gl"} onClick={() => setGender(v)}>
                {l}
              </button>
            ))}
          </div>
          <span className="lbl">Город</span>
          <button className="field gl" onClick={() => setCityOpen(true)}>
            <b>{city || "Определим на следующем шаге"}</b>
            <Ic n="chev" c="s" />
          </button>
          <span className="lbl">
            Пару слов о себе <small className="muted">до 300 символов</small>
          </span>
          <label className="field gl ta">
            <textarea rows={3} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Например: люблю кофе и утренние пробежки" />
          </label>
          <label className="agree">
            <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} />
            <span className="cb">
              <Ic n="check" />
            </span>
            <span>
              Я принимаю условия{" "}
              <a href="/legal/offer" target="_blank">
                публичной оферты
              </a>{" "}
              и{" "}
              <a href="/legal/privacy" target="_blank">
                политики конфиденциальности
              </a>
              . Мне есть 18 лет.
            </span>
          </label>
          <label className="agree">
            <input type="checkbox" checked={agreedToPd} onChange={(e) => setAgreedToPd(e.target.checked)} />
            <span className="cb">
              <Ic n="check" />
            </span>
            <span>
              Даю{" "}
              <a href="/legal/consent" target="_blank">
                согласие на обработку персональных данных
              </a>
            </span>
          </label>
        </div>
        <div className="foot">
          <button className="btn v" onClick={goNext}>
            Дальше
          </button>
        </div>
        <CitySheet open={cityOpen} onClose={() => setCityOpen(false)} city={city} onPick={setCity} />
      </section>
    );
  }

  if (step === "interests") {
    const n = selectedInterestIds.length;
    return (
      <section className="scr aurora in" data-id="interests">
        <div className="scroll" style={{ paddingBottom: 160 }}>
          <div className="bar-top">
            <button className="rb gl" onClick={goBack} aria-label="Назад">
              <Ic n="back" />
            </button>
            {prog}
          </div>
          <h1 className="t" style={{ marginTop: 20 }}>
            Что тебе <em>по душе</em>?
          </h1>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.5 }}>
            Выбери хотя бы три. По ним подберём встречи и людей с похожими интересами.
          </p>
          {grouped.map((g) => {
            const k = g.items.filter((x) => selectedInterestIds.includes(x.id)).length;
            return (
              <div key={g.title} className="igroup">
                <h3>
                  {g.title}
                  <span>{k || ""}</span>
                </h3>
                <div className="igrid">
                  {g.items.map((it) => (
                    <button key={it.id} className={`it ${selectedInterestIds.includes(it.id) ? "sel" : ""}`} onClick={() => toggleInterest(it.id)}>
                      <span className="ck">
                        <Ic n="check" />
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={interestIcon(it.name)} alt="" />
                      {it.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="foot">
          <small>{n < minInterests ? `Выбрано ${n} из ${minInterests}` : `Выбрано: ${n}`}</small>
          <button className="btn v" disabled={n < minInterests} onClick={goNext}>
            Продолжить
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="scr aurora in" data-id="geo">
      <div className="scroll">
        <div className="bar-top">
          <button className="rb gl" onClick={goBack} aria-label="Назад">
            <Ic n="back" />
          </button>
          {prog}
        </div>
        <div className="geo">
          <div className="halo">
            <Creature size={200} variant="e" />
          </div>
          <h1 className="t">
            Где ищем <em>компанию</em>?
          </h1>
          <p>Мося покажет встречи рядом. Геолокацию используем только чтобы определить город.</p>
        </div>
      </div>
      <div className="foot">
        <button className="btn v" onClick={detectCityAndFinish} disabled={locating || submitting}>
          <Ic n="nav" />
          {locating ? "Определяем…" : submitting ? "Сохраняем…" : "Определить город"}
        </button>
        <button className="btn o" onClick={() => (city ? handleSubmit() : setCityOpen(true))} disabled={submitting}>
          {city ? `Выбрать город: ${city}` : "Выбрать вручную"}
        </button>
      </div>
      <CitySheet
        open={cityOpen}
        onClose={() => setCityOpen(false)}
        city={city}
        onPick={(c) => {
          setCity(c);
          setCityOpen(false);
          handleSubmit(c);
        }}
      />
    </section>
  );
}

function CitySheet({ open, onClose, city, onPick }: { open: boolean; onClose: () => void; city: string; onPick: (c: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="t">
        Выбери <em>город</em>
      </h2>
      {open && (
        <CityWheel
          value={city}
          cities={RUSSIAN_CITIES}
          onPick={(c) => {
            onPick(c);
            onClose();
          }}
        />
      )}
    </Sheet>
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
