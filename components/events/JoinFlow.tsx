"use client";

import { mosyaSrc } from "@/components/brand/Mosya";
import { Cover, Ic, Sheet, dayLong, eventIcon } from "@/components/proto/ui";
import { confetti } from "@/lib/mosya/confetti";

export interface JoinEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  placeName: string | null;
  photoUrl?: string | null;
  category?: { slug: string } | null;
  trainingType?: { slug: string } | null;
  isBusiness?: boolean;
  organizerHidden?: boolean;
  businessPricingType?: string | null;
  businessPricingDetails?: string | null;
}

/**
 * «Я иду» как в прототипе: шторка «Отправить заявку?» (joinSheet), затем
 * экран «Заявка отправлена» (SCR.done) с шагами статуса. Сам запрос делает
 * родитель (onConfirm) — механика заявки прежняя.
 */
export function JoinFlow({
  event,
  phase,
  onConfirm,
  onClose,
}: {
  event: JoinEvent | null;
  phase: "confirm" | "sending" | "done" | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const when = event ? `${dayLong(event.eventDate)}, ${event.eventTime.slice(0, 5)}` : "";

  if (event && phase === "done") {
    return (
      <section className="scr aurora up" data-id="done" style={{ zIndex: 350 }}>
        <div className="scroll" style={{ paddingBottom: 180 }}>
          <div className="bar-top">
            <span />
            <button className="rb gl" onClick={onClose} aria-label="Закрыть">
              <Ic n="close" />
            </button>
          </div>
          <div className="done">
            <div className="burst wait">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mosyaSrc("phone")} alt="" />
            </div>
            <h1 className="t">
              Заявка <em>отправлена</em>
            </h1>
            <p>Организатор посмотрит твой профиль и ответит. Ответ придёт сюда и в Telegram.</p>
            <div className="track">
              <div className="ok">
                <i>
                  <Ic n="check" />
                </i>
                Заявка отправлена
              </div>
              <div className="run">
                <i />
                Организатор смотрит профиль
              </div>
              <div>
                <i />
                Ты в деле
              </div>
            </div>
          </div>
        </div>
        <div className="foot">
          <button className="btn o" onClick={onClose}>
            Смотреть другие встречи
          </button>
        </div>
      </section>
    );
  }

  const ticketNote =
    event?.isBusiness &&
    `После подтверждения придёт номер билета. ${
      event.businessPricingType === "ticket" && event.businessPricingDetails ? `Оплата ${event.businessPricingDetails} — организатору лично, на месте.` : "Вход свободный."
    }`;

  return (
    <Sheet open={!!event && (phase === "confirm" || phase === "sending")} onClose={onClose}>
      <h2 className="t">
        Отправить <em>заявку</em>?
      </h2>
      {event && (
        <div className="sum gl">
          <Cover photoUrl={event.photoUrl} icon={eventIcon(event)} cls="" thumb={160} />
          <div>
            <b>{event.title}</b>
            <span>
              {when} · {event.organizerHidden ? "место — после одобрения" : event.placeName ?? ""}
            </span>
          </div>
        </div>
      )}
      <div className="note gl">
        <Ic n="shield" c="s" />
        <span>
          {ticketNote ||
            (event?.organizerHidden
              ? "Организатор и точный адрес откроются, когда заявку одобрят."
              : "Организатор посмотрит твой профиль и подтвердит участие. Ответ придёт в Telegram.")}
        </span>
      </div>
      <div className="opt gl">
        <div className="d">
          <b>Напомним за 2 часа</b>
          <span>с кнопками «Иду» и «Не смогу» в боте</span>
        </div>
        <span className="sw-t on" role="img" aria-label="Напоминание включено" />
      </div>
      <button className="btn v" onClick={onConfirm} disabled={phase === "sending"}>
        {phase === "sending" ? "Отправляем…" : "Отправить заявку"}
      </button>
      <button className="btn o" onClick={onClose}>
        Не сейчас
      </button>
    </Sheet>
  );
}

/** Конфетти при одобрении/отправке — общий хелпер для экранов заявки. */
export const celebrate = confetti;
