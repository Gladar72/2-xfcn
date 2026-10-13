import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ссылка на встречу: mesto-go.ru/e/<id> — ей делятся из приложения.
 * Если приложение установлено, телефон откроет встречу сразу в нём (универсальные ссылки).
 * Иначе — эта страница: краткая карточка и кнопки «Открыть в приложении» / «Открыть в Telegram».
 * Адрес не показываем — только название, дату и город (как в карточке бота).
 */
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "Mesto_people_bot";
const SITE = (process.env.APP_URL || "https://mesto-go.ru").replace(/\/+$/, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Promise<{ id: string }> | { id: string };

interface EventBrief {
  id: string;
  title: string;
  city: string | null;
  event_date: string;
  event_time: string;
  status: string;
  photo_url: string | null;
}

async function loadEvent(id: string): Promise<EventBrief | null> {
  if (!UUID.test(id)) return null;
  try {
    const { data } = await createAdminClient()
      .from("events")
      .select("id, title, city, event_date, event_time, status, photo_url")
      .eq("id", id)
      .maybeSingle();
    return (data as EventBrief | null) ?? null;
  } catch {
    return null;
  }
}

function when(e: EventBrief): string {
  const d = new Date(`${e.event_date}T00:00:00Z`);
  const day = d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return `${day}, ${e.event_time.slice(0, 5)}`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const e = await loadEvent(id);
  if (!e || e.status !== "published") return { title: "МЕСТО — встречи рядом" };
  const description = [when(e), e.city].filter(Boolean).join(" · ");
  return {
    title: `${e.title} — МЕСТО`,
    description,
    openGraph: { title: e.title, description, images: e.photo_url ? [e.photo_url] : [`${SITE}/brand/stickers/mosya_wave.webp`] },
  };
}

export default async function EventLinkPage({ params }: { params: Params }) {
  const { id } = await params;
  const e = await loadEvent(id);
  const live = !!e && e.status === "published";
  const appLink = live ? `mesto://event/${e.id}` : "mesto://";
  const tgLink = `https://t.me/${BOT_USERNAME}${live ? `?start=e_${e.id}` : ""}`;

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "32px 20px",
        textAlign: "center",
        background: "radial-gradient(120% 80% at 50% 0%, #EDE5FF 0%, #F6F2FF 60%)",
        fontFamily: "var(--font-golos), system-ui, sans-serif",
        color: "#16121F",
      }}
    >
      {live && e.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={e.photo_url}
          alt=""
          width={340}
          height={200}
          style={{ width: "100%", maxWidth: 340, height: 200, objectFit: "cover", borderRadius: 24, boxShadow: "0 12px 40px rgba(108,59,255,0.18)" }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={live ? "/brand/stickers/mosya_wave.webp" : "/brand/stickers/mosya_sad.webp"} alt="" width={170} height={170} style={{ objectFit: "contain" }} />
      )}
      {live ? (
        <>
          <p style={{ fontSize: 14, color: "#6C3BFF", fontWeight: 600, margin: 0 }}>Тебя зовут на встречу</p>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, maxWidth: 360, lineHeight: 1.2 }}>{e.title}</h1>
          <p style={{ fontSize: 16, color: "#3D3752", margin: 0 }}>{[when(e), e.city].filter(Boolean).join(" · ")}</p>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Эта встреча уже прошла</h1>
          <p style={{ fontSize: 16, color: "#3D3752", maxWidth: 360, margin: 0, lineHeight: 1.45 }}>
            Загляни в МЕСТО — рядом всегда есть с кем сходить на кофе, тренировку или в кино.
          </p>
        </>
      )}
      <a
        href={appLink}
        style={{
          marginTop: 10,
          width: "100%",
          maxWidth: 340,
          padding: "15px 20px",
          borderRadius: 18,
          background: "linear-gradient(120deg, #6C3BFF, #A24DFF 55%, #FF6FA0)",
          color: "#fff",
          fontWeight: 600,
          fontSize: 16,
          textDecoration: "none",
        }}
      >
        Открыть в приложении
      </a>
      <a
        href={tgLink}
        style={{
          width: "100%",
          maxWidth: 340,
          padding: "15px 20px",
          borderRadius: 18,
          background: "#2AABEE",
          color: "#fff",
          fontWeight: 600,
          fontSize: 16,
          textDecoration: "none",
        }}
      >
        Открыть в Telegram
      </a>
    </main>
  );
}
