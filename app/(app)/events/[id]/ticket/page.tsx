"use client";

import { useEffect, useState } from "react";
import { useGuide } from "@/lib/mosya/guide";
import Link from "next/link";
import { CATEGORY_ICON } from "@/lib/data/category-icons";
import { Cover, Ic, Screen, Sheet } from "@/components/proto/ui";
import { useRouter } from "next/navigation";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";

interface TicketData {
  ticketCode: string;
  checkedInAt: string | null;
  conversationId: string | null;
  event: {
    id: string;
    title: string;
    photoUrl: string | null;
    eventDate: string;
    eventTime: string;
    eventEndTime: string | null;
    placeName: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    status: string;
    organizerName: string | null;
    businessPricingType?: string | null;
    businessPricingDetails?: string | null;
  };
}

/**
 * «Мой билет» на бизнес-событие: номер билета (называется организатору на
 * входе), событие, чат, маршрут и отмена участия.
 */
export default function TicketPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<TicketData | null>(null);
  useGuide("ticket");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${params.id}/ticket`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(apiErrorText(body, "Не удалось открыть билет.", res.status));
          return;
        }
        setData(body as TicketData);
      })
      .catch(() => setError("Проблема с соединением — попробуй ещё раз."));
  }, [params.id]);

  function copyCode() {
    if (!data) return;
    navigator.clipboard
      .writeText(data.ticketCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  function openRoute() {
    if (!data) return;
    const { latitude, longitude, address, placeName } = data.event;
    const url =
      latitude !== null && longitude !== null
        ? `https://yandex.ru/maps/?rtext=~${latitude},${longitude}&rtt=auto`
        : `https://yandex.ru/maps/?text=${encodeURIComponent([placeName, address].filter(Boolean).join(", "))}`;
    const webApp = getTelegramWebApp();
    if (webApp) webApp.openLink(url);
    else window.open(url, "_blank");
  }

  async function cancelParticipation() {
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${params.id}/ticket`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(apiErrorText(body, "Не удалось отменить участие.", res.status));
        setConfirmingCancel(false);
        return;
      }
      router.replace(`/events/${params.id}`);
    } catch {
      setError("Проблема с соединением — попробуй ещё раз.");
    } finally {
      setCancelling(false);
    }
  }

  const e = data?.event;
  const when = e
    ? `${new Date(e.eventDate).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" })}, ${e.eventTime.slice(0, 5)}${e.eventEndTime ? `–${e.eventEndTime.slice(0, 5)}` : ""}`
    : "";
  const pay =
    e?.businessPricingType === "ticket" && e.businessPricingDetails
      ? `Оплата ${e.businessPricingDetails} — организатору на месте`
      : e?.businessPricingType === "custom" && e.businessPricingDetails
        ? e.businessPricingDetails
        : "Вход свободный";

  return (
    <>
      <Screen id="ticket" anim="in" scrollClass="pb180">
        <div className="bar-top">
          <button className="rb gl" onClick={() => router.back()} aria-label="Назад">
            <Ic n="back" />
          </button>
          <span />
        </div>
        <h1 className="t" style={{ marginTop: 18 }}>
          Мой <em>билет</em>
        </h1>
        {!data && !error && <div className="sk" style={{ height: 420, marginTop: 16, borderRadius: 28 }} />}
        {error && <div className="note gl" style={{ marginTop: 16 }}>{error}</div>}
        {data && e && (
          <>
            <div className="tkt gl">
              <div className="okp">
                <Ic n="check" c="s" />
                {data.checkedInAt ? "Отмечен на входе" : "Участие подтверждено"}
              </div>
              <Cover photoUrl={e.photoUrl} icon={CATEGORY_ICON.business ?? ""} cls="tph" thumb={800} />
              <div className="tin">
                <b>{e.title}</b>
                <span>{when}</span>
                <span>{[e.placeName, e.address?.replace(/^Россия,\s*/, "")].filter(Boolean).join(", ")}</span>
                {e.organizerName && <span>Организатор: {e.organizerName}</span>}
              </div>
              <div className="perf" />
              <div className="tcode">
                <small>Номер билета</small>
                <div>
                  <b>{data.ticketCode}</b>
                  <button className="rb gl" style={{ width: 40, height: 40 }} onClick={copyCode} aria-label="Скопировать номер">
                    <Ic n={copied ? "check" : "copy"} c="s" />
                  </button>
                </div>
                <span>Назови номер организатору на входе</span>
                <span className="payn">
                  <Ic n="wallet" c="xs" /> {pay}
                </span>
              </div>
            </div>
            {e.status === "published" || e.status === "closed" ? (
              <button className="report" style={{ marginTop: 6 }} onClick={() => setConfirmingCancel(true)}>
                Отменить участие
              </button>
            ) : null}
          </>
        )}
      </Screen>
      {data && (
        <div className="foot" style={{ zIndex: 6 }}>
          {data.conversationId && (
            <Link className="btn v" href={`/chats/${data.conversationId}`}>
              <Ic n="chat" />
              Чат события
            </Link>
          )}
          <button className="btn o" onClick={openRoute}>
            <Ic n="route" />
            Как добраться
          </button>
        </div>
      )}
      <Sheet open={confirmingCancel} onClose={() => setConfirmingCancel(false)}>
        <h2 className="t">Отменить участие?</h2>
        <p className="muted" style={{ margin: "-4px 0 0", fontSize: 14.5, lineHeight: 1.5 }}>
          Билет перестанет действовать, место освободится для других гостей.
        </p>
        <button className="btn k" onClick={cancelParticipation} disabled={cancelling}>
          {cancelling ? "Отменяем…" : "Да, отменить"}
        </button>
        <button className="btn o" onClick={() => setConfirmingCancel(false)}>
          Не сейчас
        </button>
      </Sheet>
    </>
  );
}
