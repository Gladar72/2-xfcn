"use client";

import { useEffect, useState } from "react";
import { PLAN_LIMITS, FREE_APPLICATIONS_LIMIT, type Plan } from "@/lib/subscriptions/limits";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";
import { useRouter } from "next/navigation";
import { Ic, Screen, Sheet } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";

const FEATURES: Record<Plan, string[]> = {
  start: [
    "До 3 встреч за период",
    "Участие до 15 встреч за период",
    "1 поднятие",
    "Весь город",
    "Чат после подтверждения",
    "Группа до 4 человек",
    "Для бизнеса — группа до 40 человек",
  ],
  medium: [
    "До 15 встреч за период",
    "Участие до 30 встреч за период",
    "5 поднятий",
    "Расширенные фильтры",
    "Выделение встречи",
    "Закрытые встречи",
    "Группа до 10 человек",
    "Для бизнеса — группа до 100 человек",
    "Скрытие профиля",
  ],
  premium: [
    "Встречи без ограничений",
    "Участие без ограничений",
    "10 поднятий",
    "Выделение встречи",
    "Максимальный вес в рекомендациях",
    "Закрытые встречи",
    "Группа до 30 человек",
    "Для бизнеса — группа без ограничений",
    "Скрытие профиля",
  ],
};

interface PaywallProps {
  onActivated: () => void;
}

const PLAN_NAME: Record<Plan, string> = { start: "Старт", medium: "Медиум", premium: "Премьер" };

/** Выбор тарифа (SCR.paywall прототипа). Оплата — ЮKassa (карта/СБП), как и раньше. */
export function Paywall({ onActivated }: PaywallProps) {
  const router = useRouter();
  const [picked, setPicked] = useState<Plan>("medium");
  const [loadingCardPlan, setLoadingCardPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiptContact, setReceiptContact] = useState<string | null | undefined>(undefined); // undefined = ещё загружаем
  const [contactPromptPlan, setContactPromptPlan] = useState<Plan | null>(null);
  const [contactDraft, setContactDraft] = useState("");

  // Оплата Telegram Stars временно скрыта из интерфейса (карта/СБП —
  // единственный видимый способ сейчас) — сам API (/api/subscriptions/create-invoice)
  // и обработка оплаты в lib/telegram/bot.ts не тронуты, можно вернуть кнопку позже.
  // onActivated (колбэк успешной оплаты) относился к Stars-потоку внутри
  // Mini App; для ЮKassa активация приходит асинхронно через вебхук, пока
  // человек на внешней странице оплаты — родительский экран сам
  // перезапрашивает статус подписки при возврате.
  void onActivated;

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((data) => setReceiptContact(data.receiptContact ?? null))
      .catch(() => setReceiptContact(null));
  }, []);

  async function startPayment(plan: Plan, contact?: string) {
    setLoadingCardPlan(plan);
    setError(null);

    try {
      const res = await fetch("/api/subscriptions/yookassa/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contact ? { plan, contact } : { plan }),
      });
      const data = await res.json();

      if (!res.ok || !data.confirmationUrl) {
        setError(
          data.error === "invalid_contact"
            ? "Введи корректный email или номер телефона."
            : "Не получилось открыть оплату. Попробуй ещё раз."
        );
        setLoadingCardPlan(null);
        return;
      }

      if (contact) setReceiptContact(contact);
      setContactPromptPlan(null);
      setContactDraft("");

      // Страница оплаты ЮKassa — не Mini App, а обычный внешний сайт,
      // открываем во встроенном браузере Telegram (openLink), а не внутри
      // самого мини-приложения. Активация подписки произойдёт по вебхуку
      // (см. app/api/webhooks/yookassa/route.ts) — когда человек вернётся
      // в приложение, статус уже должен обновиться.
      const webApp = getTelegramWebApp();
      if (webApp) {
        webApp.openLink(data.confirmationUrl);
      } else {
        window.location.href = data.confirmationUrl;
      }
      setLoadingCardPlan(null);
    } catch {
      setError("Проблема с соединением.");
      setLoadingCardPlan(null);
    }
  }

  function handleSelectCard(plan: Plan) {
    // Чек по 54-ФЗ уходит на email/телефон покупателя — спрашиваем один
    // раз, дальше используем сохранённый контакт без повторных вопросов.
    if (receiptContact) {
      startPayment(plan);
    } else {
      setError(null);
      setContactPromptPlan(plan);
    }
  }

  return (
    <>
      <Screen id="paywall" anim="in" scrollClass="pb160">
        <div className="bar-top">
          <button className="rb gl" onClick={() => goBack(router, "/profile")} aria-label="Назад">
            <Ic n="back" />
          </button>
          <span className="pill lav">
            <Ic n="wallet" c="xs" /> Оплата картой / СБП
          </span>
        </div>
        <h1 className="t" style={{ marginTop: 16 }}>
          Выбери <em>тариф</em>
        </h1>
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.5 }}>
          Чтобы создавать встречи, нужна подписка. Без неё можно откликаться — до {FREE_APPLICATIONS_LIMIT} раз за период.
        </p>
        {error && !contactPromptPlan && (
          <p className="note gl" style={{ marginTop: 12, color: "#E0569B" }}>
            {error}
          </p>
        )}
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {(["start", "medium", "premium"] as Plan[]).map((pl) => (
            <button key={pl} className={`plan-c gl ${picked === pl ? "on" : ""}`} onClick={() => setPicked(pl)}>
              <div className="h">
                <b>
                  {PLAN_NAME[pl]}
                  {pl === "medium" && <span className="popb">Популярный</span>}
                </b>
                <span>{PLAN_LIMITS[pl].priceRub} ₽ / мес</span>
              </div>
              <ul>
                {FEATURES[pl].map((x) => (
                  <li key={x}>
                    <Ic n="check" c="xs" />
                    {x}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </Screen>
      <div className="foot" style={{ zIndex: 6 }}>
        <button className="btn v" onClick={() => handleSelectCard(picked)} disabled={loadingCardPlan !== null || receiptContact === undefined}>
          {loadingCardPlan ? "Открываем оплату…" : `Оплатить ${PLAN_LIMITS[picked].priceRub} ₽`}
        </button>
        <small>30 дней · чек придёт на почту или телефон</small>
      </div>

      <Sheet open={!!contactPromptPlan} onClose={() => setContactPromptPlan(null)}>
        <h2 className="t">
          Куда прислать <em>чек</em>?
        </h2>
        <p className="muted" style={{ margin: "-4px 0 0", fontSize: 14.5, lineHeight: 1.5 }}>
          По закону об онлайн-кассах чек нужно отправить на email или телефон — укажи один раз, дальше не будем спрашивать.
        </p>
        <label className="field gl">
          <input value={contactDraft} onChange={(e) => setContactDraft(e.target.value)} placeholder="email или телефон" autoFocus />
        </label>
        {error && <p style={{ color: "#E0569B", fontSize: 13.5 }}>{error}</p>}
        <button
          className="btn v"
          onClick={() => contactPromptPlan && startPayment(contactPromptPlan, contactDraft.trim())}
          disabled={!contactDraft.trim() || loadingCardPlan !== null}
        >
          {loadingCardPlan ? "Открываем оплату…" : "Продолжить"}
        </button>
      </Sheet>
    </>
  );
}
