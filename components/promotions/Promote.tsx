"use client";

/**
 * «В популярное сегодня» (вместо «Поднять встречу», согласовано 22.10):
 * - PromoteSheet — шторка: превью карточки, «по тарифу» или «разово 149 ₽»;
 * - PromoDone — экран «Ты в популярном»: сколько ещё первым и счётчики.
 * Механика — lib/promotions/server.ts.
 */
import { useEffect, useState } from "react";
import { HeroCard, Ic, Overlay, Sheet, type HeroEvent } from "@/components/proto/ui";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";
import { promoClock } from "@/lib/promotions/config";

export interface PromoStatus {
  topFrom: string;
  topUntil: string;
  endsAt: string;
  views: number;
  opens: number;
  applications: number;
}

interface PromoInfo {
  city: string | null;
  utcOffset: number;
  slot: { ok: true; topFrom: string; topUntil: string; endsAt: string; queueAhead: number } | { ok: false; reason: string; otherTitle?: string; otherEndsAt?: string };
  plan: { name: string; used: number; limit: number } | null;
  price: number;
  active: PromoStatus | null;
}

const REASON: Record<string, string> = {
  event_started: "Встреча уже началась — продвигать поздно.",
  event_not_active: "Продвигать можно только опубликованную встречу.",
  no_slot_before_start: "До начала встречи первое место уже занято другими — продвинуть не получится.",
  other_event_promoted: "В «Популярном» уже стоит другая твоя встреча — одновременно можно продвигать только одну.",
  subscription_required: "Нужна подписка — или продвинь разово.",
  boost_limit_reached: "Продвижения по тарифу закончились — можно разово.",
  invalid_contact: "Введи корректный email или номер телефона.",
};

export async function loadPromoInfo(eventId: string): Promise<PromoInfo | null> {
  const r = await fetch(`/api/promotions?eventId=${eventId}`).catch(() => null);
  return r && r.ok ? r.json() : null;
}

export function PromoteSheet({
  open,
  onClose,
  eventId,
  card,
  onPromoted,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  card: HeroEvent;
  onPromoted: (s: PromoStatus | null) => void;
}) {
  const [info, setInfo] = useState<PromoInfo | null>(null);
  const [method, setMethod] = useState<"plan" | "pay">("plan");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needContact, setNeedContact] = useState(false);
  const [contact, setContact] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setNeedContact(false);
    loadPromoInfo(eventId).then((d) => {
      setInfo(d);
      const planLeft = d?.plan ? d.plan.limit - d.plan.used : 0;
      setMethod(planLeft > 0 ? "plan" : "pay");
    });
  }, [open, eventId]);

  const off = info?.utcOffset ?? 5;
  const slot = info?.slot;
  const firstNow = slot?.ok ? Date.parse(slot.topFrom) <= Date.now() + 60_000 : false;
  const planLeft = info?.plan ? info.plan.limit - info.plan.used : 0;
  const where = info?.city ? `в ${cityIn(info.city)}` : "в твоём городе";

  async function go() {
    if (!info) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, method, ...(needContact && contact.trim() ? { contact: contact.trim() } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "contact_required") {
          setNeedContact(true);
          return;
        }
        setErr(REASON[data.error] ?? "Не получилось — попробуй ещё раз.");
        return;
      }
      if (method === "pay" && data.confirmationUrl) {
        const wa = getTelegramWebApp();
        if (wa) wa.openLink(data.confirmationUrl);
        else window.location.href = data.confirmationUrl;
        onClose();
        return;
      }
      onPromoted((data.promotion as PromoStatus | null) ?? null);
    } catch {
      setErr("Проблема с соединением — попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="t" style={{ fontSize: 26 }}>
        В <em>популярное</em> сегодня
      </h2>
      <p className="muted" style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.45 }}>
        {!info
          ? "Смотрим, свободно ли первое место…"
          : !slot?.ok
            ? slot?.reason === "other_event_promoted" && slot.otherTitle
              ? `В «Популярном» уже стоит твоя встреча «${slot.otherTitle}»${slot.otherEndsAt ? ` — до ${promoClock(slot.otherEndsAt, off)}` : ""}. Одновременно можно продвигать только одну встречу.`
              : REASON[slot?.reason ?? ""] ?? "Сейчас продвинуть нельзя."
            : firstNow
              ? `Встреча встанет первой у всех ${where}. Первый час место твоё — потом она остаётся в «Популярном» до начала встречи.`
              : `Сейчас первое место занято. Твоя встреча встанет первой в ${promoClock(slot.topFrom, off)} и пробудет там час, а до тех пор — сразу за ней. В «Популярном» — до начала встречи.`}
      </p>
      <div style={{ marginTop: 12, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ width: 300 }}>
          <HeroCard e={{ ...card, isPromoted: true, isLive: false }} full />
        </div>
      </div>
      {info && slot?.ok && (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {info.plan && (
            <button className={`ppopt gl ${method === "plan" ? "on" : ""}`} disabled={planLeft <= 0} onClick={() => setMethod("plan")} style={planLeft <= 0 ? { opacity: 0.55 } : undefined}>
              <i className="rd" />
              <div>
                <b>По тарифу «{info.plan.name}»</b>
                <span>{planLeft > 0 ? `осталось ${planLeft} из ${info.plan.limit} в этом периоде` : "в этом периоде закончились"}</span>
              </div>
              <span className="pr">0 ₽</span>
            </button>
          )}
          <button className={`ppopt gl ${method === "pay" ? "on" : ""}`} onClick={() => setMethod("pay")}>
            <i className="rd" />
            <div>
              <b>Разово</b>
              <span>без подписки · карта или СБП</span>
            </div>
            <span className="pr">{info.price} ₽</span>
          </button>
          {method === "pay" && needContact && (
            <input
              className="inp gl"
              style={{ height: 50, borderRadius: 25, padding: "0 18px", fontSize: 16 }}
              placeholder="Email или телефон для чека"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              inputMode="email"
            />
          )}
        </div>
      )}
      {err && (
        <p className="note gl" style={{ marginTop: 12, color: "#E0569B" }}>
          {err}
        </p>
      )}
      {info && slot?.ok ? (
        <button className="btn v" style={{ marginTop: 16 }} disabled={busy || (needContact && !contact.trim())} onClick={go}>
          <Ic n="up" />
          {busy ? "Секунду…" : method === "pay" ? `Оплатить ${info.price} ₽` : "В популярное"}
        </button>
      ) : (
        <button className="btn k" style={{ marginTop: 16 }} onClick={onClose}>
          Понятно
        </button>
      )}
    </Sheet>
  );
}

export function PromoDone({
  title,
  city,
  utcOffset,
  status,
  onClose,
  onShare,
}: {
  title: string;
  city: string | null;
  utcOffset: number;
  status: PromoStatus | null;
  onClose: () => void;
  onShare: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const where = city ? `в ${cityIn(city)}` : "в городе";
  const from = status ? Date.parse(status.topFrom) : 0;
  const until = status ? Date.parse(status.topUntil) : 0;
  const ends = status ? Date.parse(status.endsAt) : 0;
  const phase = !status ? "wait" : now < from ? "queue" : now < until ? "top" : "after";
  const left = Math.max(0, Math.round((until - now) / 60_000));
  const pct = phase === "top" ? Math.min(100, Math.max(4, ((now - from) / Math.max(1, until - from)) * 100)) : phase === "after" ? 100 : 0;

  return (
    <Overlay>
      <section className="scr aurora up" style={{ position: "fixed", inset: 0, zIndex: 60 }}>
        <div className="scroll" style={{ paddingBottom: 180 }}>
          <div className="done" style={{ paddingTop: 30 }}>
            <div className="burst">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/mosya/mosya_jump.webp" alt="" />
            </div>
            <h1 className="t">
              {phase === "wait" ? (
                <>
                  Оплата <em>проверяется</em>
                </>
              ) : (
                <>
                  Ты в <em>популярном</em>
                </>
              )}
            </h1>
            <p>
              {phase === "wait"
                ? "Как только ЮKassa подтвердит оплату, встреча встанет в топ ленты. Обычно это пара секунд."
                : phase === "queue"
                  ? `«${title}» станет первой ${where} в ${promoClock(status!.topFrom, utcOffset)}, а пока — сразу за первой. В «Популярном» до ${promoClock(status!.endsAt, utcOffset)}.`
                  : phase === "top"
                    ? `«${title}» первая у всех ${where} до ${promoClock(status!.topUntil, utcOffset)}, а потом остаётся в «Популярном» до ${promoClock(status!.endsAt, utcOffset)}.`
                    : `«${title}» в «Популярном» до ${promoClock(status!.endsAt, utcOffset)}.`}
            </p>
          </div>
          {status && now < ends && (
            <div className="gl" style={{ borderRadius: 26, padding: 18, marginTop: 18 }}>
              <div className="blk-h">
                <b>{phase === "top" ? "Пока ты первый" : "Продвижение"}</b>
                <span>{phase === "top" ? `первое место ещё ${left} мин` : phase === "queue" ? `первой в ${promoClock(status.topFrom, utcOffset)}` : `до ${promoClock(status.endsAt, utcOffset)}`}</span>
              </div>
              <div className="ppstat">
                <div>
                  <b>{status.views}</b>
                  <span>увидели</span>
                </div>
                <div>
                  <b>{status.opens}</b>
                  <span>открыли</span>
                </div>
                <div>
                  <b style={{ color: "var(--violet)" }}>{status.applications}</b>
                  <span>{applWord(status.applications)}</span>
                </div>
              </div>
              <div className="ppbar">
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className="foot">
          <button className="btn v" onClick={onShare}>
            <Ic n="share" />
            Поделиться встречей
          </button>
          <button className="btn o" onClick={onClose}>
            Готово
          </button>
        </div>
      </section>
    </Overlay>
  );
}

function applWord(n: number): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return "заявка";
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return "заявки";
  return "заявок";
}

/** «в Тюмени», «в Москве» — предложный падеж для самых частых окончаний. */
export function cityIn(city: string): string {
  if (/ь$/.test(city)) return city.slice(0, -1) + "и";
  if (/а$/.test(city)) return city.slice(0, -1) + "е";
  if (/[бвгджзклмнпрстфхцчшщ]$/i.test(city)) return city + "е";
  return city;
}
