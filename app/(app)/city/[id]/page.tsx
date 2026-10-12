"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cover, Ic } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";
import { openRoute } from "@/lib/maps/route";
import { KIND_LABEL, cityEventIcon, type CityEvent } from "@/lib/city-events";
import { useGuide } from "@/lib/mosya/guide";

/**
 * «Что ещё в городе»: событие из открытого источника. Мы не продаём на него
 * билеты и не выдаём за событие заведения — показываем, где подробнее, и
 * предлагаем найти компанию (создать встречу «Пойдём вместе»).
 */
export default function CityEventPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [e, setE] = useState<CityEvent | null>(null);
  const [err, setErr] = useState(false);
  useGuide("cityEvent", { when: !!e, force: true });

  useEffect(() => {
    fetch(`/api/city-events/${params.id}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(true) : setE(d)))
      .catch(() => setErr(true));
  }, [params.id]);

  if (!e)
    return (
      <section className="scr ev aurora fade" data-id="city-event">
        <div className="hb">
          <button className="rb glass" onClick={() => goBack(router, "/feed")} aria-label="Назад">
            <Ic n="back" />
          </button>
          <span />
        </div>
        {err ? (
          <div className="empty" style={{ marginTop: 160 }}>
            <b>Событие не найдено</b>
            <span>Возможно, оно уже прошло.</span>
          </div>
        ) : (
          <div className="sk" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 330, borderRadius: 0 }} />
        )}
      </section>
    );

  const today = new Date().toISOString().slice(0, 10);
  const running = !!e.endDate && e.eventDate <= today;
  const d = new Date(`${e.eventDate}T00:00:00`);
  const dayLabel = running
    ? `до ${new Date(`${e.endDate}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`
    : d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const timeLabel = running ? "идёт сейчас" : e.eventTime ? e.eventTime.slice(0, 5) : "время уточняется";
  const host = (() => {
    try {
      return new URL(e.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return e.source;
    }
  })();
  const open = () => {
    const tg = (window as unknown as { Telegram?: { WebApp?: { openLink?: (u: string) => void } } }).Telegram?.WebApp;
    if (tg?.openLink) tg.openLink(e.sourceUrl);
    else window.open(e.sourceUrl, "_blank", "noopener");
  };

  return (
    <section className="scr ev aurora in" data-id="city-event">
      <Cover photoUrl={null} icon={cityEventIcon(e.kind)} />
      <div className="ph-sh" />
      <div className="hb">
        <button className="rb glass" onClick={() => goBack(router, "/feed")} aria-label="Назад">
          <Ic n="back" />
        </button>
        <span />
      </div>
      <div className="body">
        <div className="sheet2">
          <div className="chips">
            <span className="pill lav">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cityEventIcon(e.kind)} alt="" style={{ width: 26, height: 26, marginLeft: -8 }} />
              {KIND_LABEL[e.kind ?? ""] ?? "Событие"}
            </span>
            <span className="pill gl">Что ещё в городе</span>
          </div>
          <h1 className="t" style={{ fontSize: 28 }}>
            {e.title}
          </h1>
          <div className="tiles3">
            <div className="gl">
              <Ic n="clock" c="s" />
              <b>{timeLabel}</b>
              <span>{dayLabel}</span>
            </div>
            <div className="gl">
              <Ic n="wallet" c="s" />
              <b>{e.priceText ?? "—"}</b>
              <span>{e.priceText ? "по афише" : "у организатора"}</span>
            </div>
          </div>
          {(e.placeName || e.address) && (
            <button
              className="gl"
              onClick={() => e.latitude && e.longitude && openRoute(e.latitude, e.longitude)}
              style={{ textAlign: "left", display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", borderRadius: 22 }}
            >
              <Ic n="pin" c="s" />
              <div style={{ display: "grid", gap: 2 }}>
                <b style={{ fontWeight: 500, fontSize: 15.5 }}>{e.placeName ?? "Место проведения"}</b>
                {e.address && <span style={{ fontSize: 13, color: "var(--grey)" }}>{e.address}</span>}
              </div>
            </button>
          )}
          {e.description && <p className="about">{e.description}</p>}
          <div className="gl" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "14px 16px", borderRadius: 22, textAlign: "left" }}>
            <Ic n="shield" c="s" />
            <span style={{ fontSize: 13.5, lineHeight: 1.45, flex: 1 }}>
              Это событие из городской афиши ({host}). Билеты и подробности — у организатора. А компанию можно найти здесь 😉
            </span>
          </div>
          <div style={{ height: 120 }} />
        </div>
      </div>
      <div className="cta">
        <button className="rb gl" onClick={open} aria-label="Подробнее у организатора" style={{ width: 56, height: 56 }}>
          <Ic n="share" />
        </button>
        <button className="btn v" onClick={() => router.push(`/create?fromCity=${e.id}&category=${e.category}`)}>
          <Ic n="people" />
          Найти компанию
        </button>
      </div>
    </section>
  );
}
