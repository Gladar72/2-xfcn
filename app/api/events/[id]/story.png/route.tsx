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
 * Оформление «F»: фон — та же картинка, сильно размытая; сама картинка — ЦЕЛИКОМ,
 * в своих пропорциях (афиши с текстом не обрезаются). Сверху название, справа белый
 * круг с датой, снизу белая карточка: сколько идут, место, логотип.
 *
 * Satori (next/og) не читает webp: готовые обложки берём из public/brand/covers-jpg,
 * свои фото встреч (jpeg/png) — по ссылке. Размытие фона: крошечная копия картинки
 * (оптимизатор картинок Next, 32 px), растянутая на весь экран.
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

/** Ширина и высота JPEG/PNG по заголовку файла (без сторонних библиотек). */
function imageSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1]!;
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

interface Cover {
  dataUrl: string;
  ratio: number; // ширина / высота
  sourceUrl: string; // адрес для уменьшенной копии (размытый фон)
}

async function loadCover(photoUrl: string | null, origin: string): Promise<Cover | null> {
  if (!photoUrl) return null;
  try {
    let buf: Buffer;
    let type = "image/jpeg";
    let sourceUrl: string;
    const preset = photoUrl.match(/\/brand\/covers\/([a-z]+)\.webp(?:\?.*)?$/);
    if (preset) {
      buf = await readFile(join(process.cwd(), "public/brand/covers-jpg", `${preset[1]}.jpg`));
      sourceUrl = `/brand/covers-jpg/${preset[1]}.jpg`;
    } else {
      if (!/^https:\/\//.test(photoUrl)) return null;
      const res = await fetch(photoUrl, { signal: AbortSignal.timeout(5000) });
      type = (res.headers.get("content-type") ?? "").split(";")[0] ?? "";
      if (!res.ok || !/image\/(jpeg|jpg|png)/.test(type)) return null;
      buf = Buffer.from(await res.arrayBuffer());
      sourceUrl = photoUrl;
    }
    const size = imageSize(buf);
    const ratio = size && size.w > 0 && size.h > 0 ? size.w / size.h : 4 / 3;
    return { dataUrl: `data:${type};base64,${buf.toString("base64")}`, ratio, sourceUrl: sourceUrl.startsWith("/") ? `${origin}${sourceUrl}` : sourceUrl };
  } catch {
    return null;
  }
}

/** Крошечная (32 px) копия картинки — растянутая на весь фон, она выглядит размытой. */
async function blurDataUrl(cover: Cover, origin: string): Promise<string | null> {
  try {
    const url = `${origin}/_next/image?url=${encodeURIComponent(cover.sourceUrl)}&w=32&q=50`;
    const res = await fetch(url, { headers: { Accept: "image/jpeg,image/png" }, signal: AbortSignal.timeout(4000) });
    const type = (res.headers.get("content-type") ?? "").split(";")[0] ?? "";
    if (!res.ok || !/image\/(jpeg|jpg|png)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/.test(params.id)) return new Response("not found", { status: 404 });
  const reqUrl = new URL(req.url);
  const ig = reqUrl.searchParams.get("ig") === "1";
  const origin = process.env.APP_URL?.replace(/\/$/, "") || reqUrl.origin;

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
    loadCover(e.photo_url, origin),
  ]);
  const blur = cover ? await blurDataUrl(cover, origin) : null;

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
  const titleSize = title.length <= 10 ? 128 : title.length <= 20 ? 100 : title.length <= 36 ? 80 : 64;
  const kicker = e.is_business ? "Ждём тебя" : "Ищу компанию";
  const people = [going > 0 ? `${going} ${going === 1 ? "идёт" : "идут"}` : null, free > 0 ? `свободно ${free} ${seatsWord(free)}` : "мест нет"]
    .filter(Boolean)
    .join(" · ");

  // Картинка — целиком, в своих пропорциях: ширина до 1020, высота — сколько остаётся.
  const photoTop = 600;
  const cardH = 360;
  const reserveBottom = ig ? 440 : 200;
  const maxH = 1920 - photoTop - 60 - cardH - reserveBottom;
  let pw = 1020;
  let ph = cover ? pw / cover.ratio : 0;
  if (ph > maxH) {
    ph = maxH;
    pw = ph * (cover?.ratio ?? 1);
  }
  const cardTop = cover ? photoTop + ph + 60 : 760;

  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1920, display: "flex", position: "relative", background: "#1B1230", color: "#fff", fontFamily: "Golos" }}>
        {blur ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={blur} alt="" width={1080} height={1920} style={{ position: "absolute", left: -60, top: -60, width: 1200, height: 2040, objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, display: "flex", background: "linear-gradient(160deg,#4B1FB8,#6C3BFF 45%,#A24DFF 75%,#FF6FA0)" }} />
        )}
        <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, display: "flex", background: "rgba(0,0,0,0.32)" }} />

        <div style={{ position: "absolute", left: 66, right: 360, top: 250, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 42, fontWeight: 500, letterSpacing: 7, textTransform: "uppercase", opacity: 0.92, display: "flex" }}>{kicker}</div>
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1, marginTop: 20, letterSpacing: -2, display: "flex" }}>{title}</div>
        </div>

        <div
          style={{
            position: "absolute",
            right: 54,
            top: 210,
            width: 276,
            height: 276,
            borderRadius: 276,
            background: "#fff",
            color: "#16121F",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            transform: "rotate(8deg)",
            boxShadow: "0 30px 90px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ fontSize: 36, fontWeight: 500, color: "#6B6585", display: "flex" }}>{weekday}</div>
          <div style={{ fontSize: 108, fontWeight: 700, lineHeight: 1, display: "flex" }}>{String(dayNum)}</div>
          <div style={{ fontSize: 42, fontWeight: 700, color: "#6C3BFF", display: "flex" }}>{time}</div>
        </div>

        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.dataUrl}
            alt=""
            width={Math.round(pw)}
            height={Math.round(ph)}
            style={{
              position: "absolute",
              left: Math.round((1080 - pw) / 2),
              top: photoTop,
              width: Math.round(pw),
              height: Math.round(ph),
              borderRadius: 60,
              boxShadow: "0 40px 120px rgba(0,0,0,0.45)",
            }}
          />
        ) : null}

        <div
          style={{
            position: "absolute",
            left: 48,
            right: 48,
            top: cardTop,
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
              bottom: 200,
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
