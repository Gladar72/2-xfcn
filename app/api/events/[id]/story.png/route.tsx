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

  const [bold, medium, mosya, wordmark, cover] = await Promise.all([
    asset("GolosText-Bold.ttf"),
    asset("GolosText-Medium.ttf"),
    asset("mosya_party.png"),
    asset("wordmark-white.svg"),
    coverDataUrl(e.photo_url),
  ]);

  const day = new Date(`${e.event_date}T00:00:00Z`).toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const when = `${day} · ${String(e.event_time).slice(0, 5)}`;
  const address = (e.address ?? "").replace(/^Россия,\s*/i, "").replace(new RegExp(`^${e.city ?? "—"},\\s*`, "i"), "");
  const place = e.is_anonymous
    ? "Место откроется после одобрения заявки"
    : [e.place_name?.trim(), address].filter(Boolean).join(", ");
  const free = Math.max(0, (e.seats_total ?? 0) - (e.seats_taken ?? 0));
  const price = e.is_business
    ? e.business_pricing_type === "free"
      ? "Вход свободный"
      : e.business_pricing_details
    : e.cost_type === "free"
      ? "Бесплатно"
      : null;
  const title: string = e.title ?? "";
  const titleSize = title.length <= 18 ? 108 : title.length <= 34 ? 86 : 68;
  const chip = e.is_business ? "Ждём тебя в «Месте»" : "Ищу компанию";

  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1920, display: "flex", position: "relative", background: "#1B1230", color: "#fff", fontFamily: "Golos" }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" width={1080} height={1344} style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1344, objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1344, display: "flex", background: "linear-gradient(135deg,#6C3BFF,#A24DFF 50%,#FF6FA0)" }} />
        )}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1080,
            height: 1920,
            display: "flex",
            background: "linear-gradient(180deg, rgba(27,18,48,0) 30%, rgba(27,18,48,0.85) 58%, #1B1230 72%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 60,
            top: 228,
            display: "flex",
            alignItems: "center",
            background: "rgba(255,255,255,0.2)",
            padding: "18px 36px",
            borderRadius: 99,
            fontSize: 36,
            fontWeight: 500,
          }}
        >
          <div style={{ width: 22, height: 22, borderRadius: 22, background: "#5BE38F", marginRight: 18, display: "flex" }} />
          {chip}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${mosya.toString("base64")}`} alt="" width={312} height={312} style={{ position: "absolute", right: 18, top: 680 }} />
        <div style={{ position: "absolute", left: 60, right: 60, top: 990, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.04, letterSpacing: -1, display: "flex" }}>{title}</div>
          <div style={{ fontSize: 45, fontWeight: 500, color: "#E4D9FF", marginTop: 36, display: "flex" }}>{when}</div>
          {place ? <div style={{ fontSize: 42, fontWeight: 500, color: "#E4D9FF", marginTop: 10, display: "flex" }}>{place}</div> : null}
          <div style={{ display: "flex", marginTop: 40 }}>
            {free > 0 ? (
              <div style={{ display: "flex", background: "#fff", color: "#1B1230", fontWeight: 700, fontSize: 39, padding: "20px 36px", borderRadius: 99, marginRight: 24 }}>
                {`Свободно ${free} ${seatsWord(free)}`}
              </div>
            ) : null}
            {price ? (
              <div style={{ display: "flex", background: "rgba(255,255,255,0.16)", fontWeight: 500, fontSize: 39, padding: "20px 36px", borderRadius: 99 }}>{price}</div>
            ) : null}
          </div>
        </div>
        {ig ? (
          <div
            style={{
              position: "absolute",
              left: 60,
              right: 60,
              bottom: 192,
              height: 162,
              border: "4px dashed rgba(255,255,255,0.35)",
              borderRadius: 42,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              color: "rgba(255,255,255,0.55)",
            }}
          >
            сюда — стикер «Ссылка»
          </div>
        ) : null}
        <div style={{ position: "absolute", left: 60, right: 60, bottom: 66, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/svg+xml;base64,${wordmark.toString("base64")}`} alt="" width={228} height={54} />
          <div style={{ fontSize: 33, color: "#C9B6FF", display: "flex" }}>{`@${BOT}`}</div>
        </div>
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
