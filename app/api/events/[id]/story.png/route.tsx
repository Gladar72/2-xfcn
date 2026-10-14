import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events/[id]/story.png — картинка 1080×1920 для сторис (Telegram, Instagram)
 * и для напоминания «никто не откликнулся» в боте.
 * Путь оканчивается на .png — middleware его не трогает (Telegram забирает картинку без входа).
 * ?ig=1 — с пунктирной рамкой под стикер «Ссылка» (Instagram не даёт вставить ссылку сам).
 *
 * Satori (next/og) не читает webp, поэтому готовые обложки берём из public/brand/covers-jpg,
 * а свои фото встреч (jpeg) — по ссылке; если фото не загрузилось — фон без фото.
 */

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "Mesto_people_bot";
const asset = (name: string) => readFile(join(process.cwd(), "assets/og", name));

function seatsWord(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return "место";
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "места";
  return "мест";
}

async function coverDataUrl(photoUrl: string | null): Promise<string | null> {
  if (!photoUrl) return null;
  try {
    const preset = photoUrl.match(/\/brand\/covers\/([a-z]+)\.webp(?:\?.*)?$/);
    if (preset) {
      const buf = await readFile(join(process.cwd(), "public/brand/covers-jpg", `${preset[1]}.jpg`));
      return `data:image/jpeg;base64,${buf.toString("base64")}`;
    }
    if (!/^https:\/\//.test(photoUrl)) return null;
    const res = await fetch(photoUrl, { signal: AbortSignal.timeout(5000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/image\/(jpeg|jpg|png)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/.test(params.id)) return new Response("not found", { status: 404 });
  const ig = new URL(req.url).searchParams.get("ig") === "1";

  const admin = createAdminClient();
  const { data: e } = await admin
    .from("events")
    .select(
      "title, city, place_name, address, event_date, event_time, seats_total, seats_taken, status, is_business, cost_type, business_pricing_type, business_pricing_details, photo_url, is_anonymous"
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!e || !["published", "closed"].includes(e.status)) return new Response("not found", { status: 404 });

  const [bold, medium, wordmark, cover] = await Promise.all([
    asset("GolosText-Bold.ttf"),
    asset("GolosText-Medium.ttf"),
    asset("wordmark-dark.svg"),
    coverDataUrl(e.photo_url),
  ]);

  const date = new Date(`${e.event_date}T00:00:00Z`);
  const weekday = date.toLocaleDateString("ru-RU", { weekday: "long", timeZone: "UTC" });
  const dayNum = date.getUTCDate();
  const time = String(e.event_time).slice(0, 5);
  const address = (e.address ?? "").replace(/^Россия,\s*/i, "").replace(new RegExp(`^${e.city ?? "—"},\\s*`, "i"), "");
  const place = e.is_anonymous
    ? "Место откроется после одобрения заявки"
    : [e.place_name?.trim(), address].filter(Boolean).join(", ");
  const free = Math.max(0, (e.seats_total ?? 0) - (e.seats_taken ?? 0));
  const going = (e.seats_taken ?? 0) + (e.is_business ? 0 : 1); // организатор встречи тоже идёт
  const price = e.is_business
    ? e.business_pricing_type === "free"
      ? "Вход свободный"
      : e.business_pricing_details
    : e.cost_type === "free"
      ? "Бесплатно"
      : null;
  const title: string = e.title ?? "";
  const titleSize = title.length <= 12 ? 150 : title.length <= 24 ? 118 : title.length <= 40 ? 92 : 74;
  const kicker = e.is_business ? "Ждём тебя" : "Ищу компанию";
  const people = [going > 0 ? `${going} ${going === 1 ? "идёт" : "идут"}` : null, free > 0 ? `свободно ${free} ${seatsWord(free)}` : "мест нет"]
    .filter(Boolean)
    .join(" · ");
  // Карточка снизу: в версии для Instagram под ней остаётся рамка под стикер «Ссылка».
  const cardBottom = ig ? 470 : 300;

  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1920, display: "flex", position: "relative", background: "#1B1230", color: "#fff", fontFamily: "Golos" }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, display: "flex", background: "linear-gradient(135deg,#6C3BFF,#A24DFF 50%,#FF6FA0)" }} />
        )}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1080,
            height: 1920,
            display: "flex",
            background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 34%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.5) 100%)",
          }}
        />
        <div style={{ position: "absolute", left: 66, right: 66, top: 250, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 44, fontWeight: 500, letterSpacing: 7, textTransform: "uppercase", opacity: 0.92, display: "flex" }}>{kicker}</div>
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1, marginTop: 24, letterSpacing: -2, display: "flex" }}>{title}</div>
        </div>
        <div
          style={{
            position: "absolute",
            right: 66,
            top: ig ? 720 : 860,
            width: 312,
            height: 312,
            borderRadius: 312,
            background: "#fff",
            color: "#16121F",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            transform: "rotate(8deg)",
            boxShadow: "0 30px 90px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ fontSize: 38, fontWeight: 500, color: "#6B6585", display: "flex" }}>{weekday}</div>
          <div style={{ fontSize: 120, fontWeight: 700, lineHeight: 1, display: "flex" }}>{String(dayNum)}</div>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#6C3BFF", display: "flex" }}>{time}</div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 48,
            right: 48,
            bottom: cardBottom,
            background: "#fff",
            borderRadius: 72,
            padding: "48px 54px",
            color: "#16121F",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 48px 120px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", fontSize: 45, fontWeight: 700 }}>
            <div style={{ width: 24, height: 24, borderRadius: 24, background: free > 0 ? "#2BB673" : "#C9B6FF", marginRight: 20, display: "flex" }} />
            {people}
          </div>
          {place ? <div style={{ fontSize: 40, fontWeight: 500, color: "#6B6585", marginTop: 18, display: "flex" }}>{place}</div> : null}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 34 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/svg+xml;base64,${wordmark.toString("base64")}`} alt="" width={232} height={49} />
            <div style={{ fontSize: 36, fontWeight: 500, color: "#8A84A0", display: "flex" }}>{price ?? `@${BOT}`}</div>
          </div>
        </div>
        {ig ? (
          <div
            style={{
              position: "absolute",
              left: 150,
              right: 150,
              bottom: 250,
              height: 160,
              border: "4px dashed rgba(255,255,255,0.6)",
              borderRadius: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              color: "rgba(255,255,255,0.8)",
            }}
          >
            сюда — стикер «Ссылка»
          </div>
        ) : null}
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      fonts: [
        { name: "Golos", data: medium, weight: 500, style: "normal" },
        { name: "Golos", data: bold, weight: 700, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    }
  );
}
