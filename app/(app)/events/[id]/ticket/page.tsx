"use client";

import { useEffect, useState } from "react";
import { useGuide } from "@/lib/mosya/guide";
import { Icon } from "@/components/brand/Icon";
import Link from "next/link";
import Image from "next/image";
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

  return (
    <div className="px-5 pb-28 pt-4">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Назад" className="m-glass m-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
          <Icon name="back" size={22} className="" />
        </button>
        <h1 className="m-title text-[28px]">Мой билет</h1>
      </div>

      {!data && !error && <p className="py-10 text-center text-sm text-ink-600">Загрузка...</p>}

      {!data && error && (
        <div className="rounded-card m-glass p-6 text-center">
          <p className="mb-4 text-sm text-ink-900">{error}</p>
          <Link href={`/events/${params.id}`} className="text-sm font-semibold text-accent">
            К событию
          </Link>
        </div>
      )}

      {data && (
        <>
          <div className="overflow-hidden rounded-card-lg m-glass">
            <div className="p-4">
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-pill bg-lavender-100 px-3 py-1.5 text-sm font-medium text-accent">
                <Image src="/mesto/assets/icons/png/ticket.png" alt="" width={20} height={20} className="object-contain" />
                {data.checkedInAt ? "Отмечен на входе" : "Участие подтверждено"}
              </span>

              <Link href={`/events/${data.event.id}`} className="flex gap-3">
                {data.event.photoUrl && (
                  <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-card-sm">
                    <Image src={data.event.photoUrl} alt="" fill className="object-cover" sizes="112px" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="mb-2 text-base font-bold leading-snug text-ink-900">{data.event.title}</p>
                  <InfoLine icon="/brand/3d/icon-calendar.png">
                    {formatDay(data.event.eventDate)} · {data.event.eventTime.slice(0, 5)}
                    {data.event.eventEndTime ? `–${data.event.eventEndTime.slice(0, 5)}` : ""}
                  </InfoLine>
                  {(data.event.placeName || data.event.address) && (
                    <InfoLine icon="/brand/3d/icon-location.png">
                      <span className="block text-ink-900">{data.event.placeName ?? data.event.address}</span>
                      {data.event.placeName && data.event.address && (
                        <span className="block text-xs text-ink-600">{data.event.address}</span>
                      )}
                    </InfoLine>
                  )}
                </div>
              </Link>

              {data.event.organizerName && (
                <div className="mt-3 flex items-center gap-2 border-t border-ink-400/15 pt-3 text-sm text-ink-900">
                  <Icon name="people" size={20} className="text-accent" />
                  <span>
                    <span className="text-ink-600">Организатор: </span>
                    {data.event.organizerName}
                  </span>
                </div>
              )}
            </div>

            {/* Линия отрыва билета с «вырезами» по краям */}
            <div className="relative h-0">
              <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-background" />
              <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-background" />
              <div className="mx-5 border-t-2 border-dashed border-ink-400/25" />
            </div>

            <div className="px-5 pb-5 pt-4">
              <p className="text-sm text-ink-600">Номер билета</p>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-extrabold leading-tight tracking-wide text-ink-900">
                  {data.ticketCode}
                </span>
                <button onClick={copyCode} aria-label="Скопировать номер" className="relative">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="8" y="8" width="12" height="12" rx="2.5" stroke="#111111" strokeWidth="1.8" />
                    <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" stroke="#111111" strokeWidth="1.8" />
                  </svg>
                  <span className="sr-only">Скопировать</span>
                  {copied && (
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-caption text-white">
                      Скопировано
                    </span>
                  )}
                </button>
              </div>
              <p className="text-sm text-ink-600">Назови номер организатору</p>
            </div>
          </div>

          {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

          <div className="mt-4 space-y-3">
            {data.conversationId && (
              <Link
                href={`/chats/${data.conversationId}`}
                className="block w-full rounded-pill bg-brand-gradient py-4 text-center text-base font-semibold text-white shadow-cta m-btn-v relative overflow-hidden"
              >
                Чат события
              </Link>
            )}
            <button
              onClick={openRoute}
              className="flex w-full items-center justify-center gap-2 rounded-pill m-glass py-4 text-base font-semibold text-accent"
            >
              <Icon name="nav" size={22} className="text-accent" />
              Как добраться
            </button>

            {!confirmingCancel ? (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="w-full py-2 text-center text-sm font-medium text-ink-600"
              >
                Отменить участие
              </button>
            ) : (
              <div className="rounded-card bg-red-50 p-4 text-center shadow-card">
                <p className="mb-3 text-sm text-ink-900">Точно отменить участие? Билет перестанет действовать, место освободится.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmingCancel(false)}
                    className="flex-1 rounded-pill m-glass py-2.5 text-sm font-medium text-ink-600"
                  >
                    Не отменять
                  </button>
                  <button
                    onClick={cancelParticipation}
                    disabled={cancelling}
                    className="flex-1 rounded-pill bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {cancelling ? "Отменяем..." : "Да, отменить"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function InfoLine({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-start gap-2 text-sm text-ink-900">
      <Image src={icon} alt="" width={20} height={20} className="mt-px shrink-0 object-contain" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function formatDay(dateIso: string): string {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (dateIso === todayIso) return "Сегодня";
  return new Date(`${dateIso}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
