import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { anonymousOrganizerName } from "@/lib/events/anonymity";
import { cityDates } from "@/lib/events/local-dates";
import { CATEGORY_ICON, trainingIcon } from "@/lib/data/category-icons";
import { PhoneStory } from "./phone-layout";
import { InviteStory } from "./invite-layout";

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
// Шрифты и логотип читаем один раз на «тёплый» экземпляр функции, а не на каждый запрос.
const assetCache = new Map<string, Promise<Buffer>>();
const asset = (name: string) => {
  let p = assetCache.get(name);
  if (!p) {
    p = readFile(join(process.cwd(), "assets/og", name));
    p.catch(() => assetCache.delete(name));
    assetCache.set(name, p);
  }
  return p;
};

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

/** Откуда брать обложку: заготовки — из jpg-копий в репозитории, свои фото — по https. */
function coverSource(photoUrl: string | null): { preset: string | null; url: string } | null {
  if (!photoUrl) return null;
  const preset = photoUrl.match(/\/brand\/covers\/([a-z]+)\.webp(?:\?.*)?$/);
  // Свой файл — относительным путём: оптимизатор картинок Next принимает так только локальные.
  if (preset) return { preset: preset[1]!, url: `/brand/covers-jpg/${preset[1]}.jpg` };
  if (!/^https:\/\//.test(photoUrl)) return null;
  return { preset: null, url: photoUrl };
}

async function fetchImage(url: string, ms: number): Promise<{ buf: Buffer; type: string } | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "image/jpeg,image/png" }, signal: AbortSignal.timeout(ms) });
    const type = (res.headers.get("content-type") ?? "").split(";")[0] ?? "";
    if (!res.ok || !/image\/(jpeg|jpg|png)/.test(type)) return null;
    return { buf: Buffer.from(await res.arrayBuffer()), type };
  } catch {
    return null;
  }
}

async function loadCover(src: { preset: string | null; url: string } | null, origin: string): Promise<Cover | null> {
  if (!src) return null;
  try {
    let img: { buf: Buffer; type: string } | null;
    if (src.preset) {
      img = { buf: await readFile(join(process.cwd(), "public/brand/covers-jpg", `${src.preset}.jpg`)), type: "image/jpeg" };
    } else {
      // Свои фото бывают по 5–10 МБ: берём уменьшенную копию (1080 px) через оптимизатор
      // картинок — она весит в десятки раз меньше и кэшируется. Не вышло — оригинал.
      img =
        (await fetchImage(`${origin}/_next/image?url=${encodeURIComponent(src.url)}&w=1080&q=80`, 5000)) ??
        (await fetchImage(src.url, 6000));
    }
    if (!img) return null;
    const size = imageSize(img.buf);
    const ratio = size && size.w > 0 && size.h > 0 ? size.w / size.h : 4 / 3;
    return { dataUrl: `data:${img.type};base64,${img.buf.toString("base64")}`, ratio, sourceUrl: src.url };
  } catch {
    return null;
  }
}

/** Крошечная (32 px) копия картинки — растянутая на весь фон, она выглядит размытой. */
async function blurDataUrl(src: { url: string } | null, origin: string): Promise<string | null> {
  if (!src) return null;
  const img = await fetchImage(`${origin}/_next/image?url=${encodeURIComponent(src.url)}&w=32&q=50`, 4000);
  return img ? `data:${img.type};base64,${img.buf.toString("base64")}` : null;
}

/**
 * Цветная тень под фото — своя у каждой картинки: крошечная копия обложки (её цвета),
 * растянутая и обрезанная мягкой маской. Без гауссова размытия — рисуется быстро.
 */
function glowSvg(blur: string, mask: string, w: number, h: number, sat: number, gain: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><mask id="m" mask-type="alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}">` +
    `<image href="${mask}" xlink:href="${mask}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/></mask>` +
    `<filter id="s" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="${sat}"/><feComponentTransfer><feFuncR type="linear" slope="${gain}"/><feFuncG type="linear" slope="${gain}"/><feFuncB type="linear" slope="${gain}"/></feComponentTransfer></filter></defs>` +
    `<g mask="url(#m)"><image href="${blur}" xlink:href="${blur}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" filter="url(#s)"/></g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/.test(params.id)) return new Response("not found", { status: 404 });
  const reqUrl = new URL(req.url);
  const ig = reqUrl.searchParams.get("ig") === "1";
  const glow = reqUrl.searchParams.get("glow") ?? "4";
  const origin = process.env.APP_URL?.replace(/\/$/, "") || reqUrl.origin;

  const t0 = Date.now();
  const admin = createAdminClient();
  const { data: e } = await admin
    .from("events")
    .select(
      "title, description, city, place_name, address, event_date, event_time, seats_total, seats_taken, status, is_business, cost_type, business_pricing_type, business_pricing_details, photo_url, is_anonymous, category:categories(slug), training_type:training_types(slug), organizer:users(name, avatar_url, birth_date, gender)"
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!e || !["published", "closed"].includes(e.status)) return new Response("not found", { status: 404 });

  const tDb = Date.now() - t0;
  // По умолчанию — приглашение (согласовано 20.10); ?layout=phone — телефон, ?layout=old — прежний вид.
  const layout = reqUrl.searchParams.get("layout");
  if (layout !== "old") return phoneStoryResponse(e, ig, origin, tDb, layout === "phone" ? "phone" : "invite");
  // Обложка и её размытая копия — параллельно, а не одна за другой.
  const src = coverSource(e.photo_url);
  const [bold, medium, wordmark, shRect, shRound, glowMaskBuf, cover, blurRaw] = await Promise.all([
    asset("GolosText-Bold.ttf"),
    asset("GolosText-Medium.ttf"),
    asset("wordmark-dark.svg"),
    asset("shadow-rect.png"),
    asset("shadow-round.png"),
    asset("glow-mask.png"),
    loadCover(src, origin),
    blurDataUrl(src, origin),
    asset("mosya_jump.png"),
    asset("glow-mask.png"),
  ]);
  const blur = cover ? blurRaw : null;
  // Тени — готовые размытые PNG, растянутые под элемент. Настоящий boxShadow с большим
  // размытием Satori/resvg считает ~6 секунд на 1080×1920 — главная причина долгой загрузки.
  const shadowRect = `data:image/png;base64,${shRect.toString("base64")}`;
  const shadowRound = `data:image/png;base64,${shRound.toString("base64")}`;
  const glowMask = `data:image/png;base64,${glowMaskBuf.toString("base64")}`;
  const GK = glow === "1" ? 1.5 : glow === "4" ? 1.85 : 1.75;
  const Shade = ({ src, x, y, w, h }: { src: string; x: number; y: number; w: number; h: number }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={Math.round(w * 1.5)} height={Math.round(h * 1.5)} style={{ position: "absolute", left: Math.round(x - w * 0.25), top: Math.round(y - h * 0.25), width: Math.round(w * 1.5), height: Math.round(h * 1.5) }} />
  );
  const tImg = Date.now() - t0 - tDb;

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
  // Название переносится по словам в колонке шириной 654 px (справа круг с датой).
  // Считаем строки заранее и опускаем картинку под последнюю строку — текст не заходит на фото.
  const TITLE_W = 654;
  const titleLines = (size: number) => {
    const perLine = Math.max(1, Math.floor(TITLE_W / (size * 0.6)));
    let lines = 1;
    let cur = 0;
    for (const w of title.split(/\s+/).filter(Boolean)) {
      const len = w.length;
      if (cur === 0) cur = len;
      else if (cur + 1 + len <= perLine) cur += 1 + len;
      else {
        lines += 1;
        cur = len;
      }
      while (cur > perLine) {
        lines += 1;
        cur -= perLine;
      }
    }
    return lines;
  };
  let titleSize = title.length <= 10 ? 128 : title.length <= 20 ? 100 : title.length <= 36 ? 84 : 68;
  while (titleSize > 60 && titleLines(titleSize) > 3) titleSize -= 8;
  const titleBottom = 250 + 42 + 20 + titleLines(titleSize) * titleSize;
  const kicker = e.is_business ? "Ждём тебя" : "Ищу компанию";
  const people = [going > 0 ? `${going} ${going === 1 ? "идёт" : "идут"}` : null, free > 0 ? `свободно ${free} ${seatsWord(free)}` : "мест нет"]
    .filter(Boolean)
    .join(" · ");

  // Картинка — целиком, в своих пропорциях: ширина до 1020, высота — сколько остаётся.
  // Снизу оставляем место под поле «Отправить сообщение» Instagram, в версии ig — ещё рамку под стикер.
  const photoTop = Math.max(540, titleBottom + 50);
  const gap = 50;
  const cardH = 330;
  const frameH = 150;
  const maxH = 1920 - 180 - photoTop - gap - cardH - (ig ? 40 + frameH : 0);
  let pw = 1020;
  let ph = cover ? pw / cover.ratio : 0;
  if (ph > maxH) {
    ph = maxH;
    pw = ph * (cover?.ratio ?? 1);
  }
  const cardTop = cover ? photoTop + ph + gap : 760;

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

        <Shade src={shadowRound} x={750} y={240} w={276} h={276} />
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
          }}
        >
          <div style={{ fontSize: weekday.length > 8 ? 29 : 36, fontWeight: 500, color: "#6B6585", display: "flex" }}>{weekday}</div>
          <div style={{ fontSize: 108, fontWeight: 700, lineHeight: 1, display: "flex" }}>{String(dayNum)}</div>
          <div style={{ fontSize: 42, fontWeight: 700, color: "#6C3BFF", display: "flex" }}>{time}</div>
        </div>

        {cover && blur && (glow === "3" || glow === "4") ? <Shade src={shadowRect} x={(1080 - pw) / 2} y={photoTop + 40} w={pw} h={ph} /> : null}
        {cover && blur && glow ? (
          // Своя тень у каждой картинки: цвета самой обложки, мягкие края.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={glowSvg(blur, glowMask, Math.round(pw * GK), Math.round(ph * GK), glow === "1" ? 1.6 : glow === "4" ? 2.8 : 2.4, glow === "1" ? 1 : glow === "4" ? 1.8 : 1.45)}
            alt=""
            width={Math.round(pw * GK)}
            height={Math.round(ph * GK)}
            style={{ position: "absolute", left: Math.round((1080 - pw * GK) / 2), top: Math.round(photoTop + 50 - (ph * (GK - 1)) / 2), width: Math.round(pw * GK), height: Math.round(ph * GK) }}
          />
        ) : cover ? (
          <Shade src={shadowRect} x={(1080 - pw) / 2} y={photoTop + 40} w={pw} h={ph} />
        ) : null}
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
            }}
          />
        ) : null}

        <Shade src={shadowRect} x={48} y={cardTop + 48} w={984} h={330} />
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
              top: cardTop + cardH + 40,
              height: frameH,
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
      // Адрес картинки содержит ?v=<хэш обложки/названия/времени/мест> — при правке он меняется,
      // поэтому готовую картинку можно долго держать в CDN и в браузере.
      headers: { "Server-Timing": `db;dur=${tDb}, img;dur=${tImg}`, "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400" },
    }
  );
}

type StoryEvent = NonNullable<Awaited<ReturnType<typeof loadEventForStory>>>;
// Только для вывода типа строки события (запрос тот же, что в GET).
async function loadEventForStory(id: string) {
  return (
    await createAdminClient()
      .from("events")
      .select(
        "title, description, city, place_name, address, event_date, event_time, seats_total, seats_taken, status, is_business, cost_type, business_pricing_type, business_pricing_details, photo_url, is_anonymous, category:categories(slug), training_type:training_types(slug), organizer:users(name, avatar_url, birth_date, gender)"
      )
      .eq("id", id)
      .maybeSingle()
  ).data;
}

function ageOf(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a > 0 && a < 120 ? a : null;
}

async function phoneStoryResponse(e: StoryEvent, ig: boolean, origin: string, tDb: number, kind: "phone" | "invite" = "phone") {
  const t1 = Date.now();
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const org = one(e.organizer as unknown as { name: string | null; avatar_url: string | null; birth_date: string | null; gender: string | null } | null);
  const catSlug = one(e.category as unknown as { slug: string } | null)?.slug ?? null;
  const ttSlug = one(e.training_type as unknown as { slug: string } | null)?.slug ?? null;
  const iconPath = e.is_business ? CATEGORY_ICON.business : catSlug === "training" ? trainingIcon(ttSlug) : catSlug === "custom" ? "/brand/cat3d/i_games.webp" : catSlug ? CATEGORY_ICON[catSlug] : null;
  const iconName = iconPath?.match(/\/(i_[a-z]+)\.webp$/)?.[1] ?? null;

  const avatarSrc = !e.is_anonymous && !e.is_business && org?.avatar_url && /^https:\/\//.test(org.avatar_url) ? org.avatar_url : null;
  const src = coverSource(e.photo_url);
  const [bold, medium, wordmark, shRect, cover, icon, avatar, blurRaw, mosyaBuf, glowMaskBuf] = await Promise.all([
    asset("GolosText-Bold.ttf"),
    asset("GolosText-Medium.ttf"),
    asset("wordmark-dark.svg"),
    asset("shadow-rect.png"),
    loadCover(src, origin),
    iconName ? asset(`cat3d/${iconName}.png`).catch(() => null) : Promise.resolve(null),
    avatarSrc ? fetchImage(`${origin}/_next/image?url=${encodeURIComponent(avatarSrc)}&w=96&q=80`, 4000).then((r) => r ?? fetchImage(avatarSrc, 4000)) : Promise.resolve(null),
    blurDataUrl(src, origin),
    asset("mosya_jump.png"),
    asset("glow-mask.png"),
  ]);

  const cd = cityDates(e.city);
  const date = new Date(`${e.event_date}T00:00:00Z`);
  const dateTop = e.event_date === cd.today ? "сегодня" : e.event_date === cd.tomorrow ? "завтра" : date.toLocaleDateString("ru-RU", { weekday: "long", timeZone: "UTC" });
  const month = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).replace(/^\d+\s*/, "");
  const city = e.city ?? "";
  const street = (e.address ?? "").replace(/^Россия,\s*/i, "").replace(new RegExp(`^${city || "—"},\\s*`, "i"), "");
  const free = Math.max(0, (e.seats_total ?? 0) - (e.seats_taken ?? 0));
  const age = ageOf(org?.birth_date);
  const orgName = org?.name?.trim() || "Организатор";
  // «Точка на карте» — заглушка, когда место выбрано булавкой без названия.
  const placeName = e.place_name?.trim() && !/^точка на карте$/i.test(e.place_name.trim()) ? e.place_name.trim() : "";
  const who = e.is_anonymous
    ? { name: `${anonymousOrganizerName(org?.gender ?? null)} · зовёт`, avatar: null, initial: "?" }
    : e.is_business
      ? { name: `${placeName || orgName} · для бизнеса`, avatar: null, initial: (placeName || orgName).charAt(0).toUpperCase() }
      : { name: `${orgName}${age ? `, ${age}` : ""} · зовёт`, avatar: avatar ? `data:${avatar.type};base64,${avatar.buf.toString("base64")}` : null, initial: orgName.charAt(0).toUpperCase() };

  const fonts = [
    { name: "Golos", data: medium, weight: 500 as const, style: "normal" as const },
    { name: "Golos", data: bold, weight: 700 as const, style: "normal" as const },
  ];
  const headers = { "Server-Timing": `db;dur=${tDb}, img;dur=${Date.now() - t1}`, "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400" };
  if (kind === "invite") {
    const blur = cover ? blurRaw : null;
    const ratio = cover?.ratio ?? 4 / 3;
    const ph = Math.round(Math.max(520, Math.min(920 / ratio, 780)));
    const WEEK_ACC: Record<string, string> = { понедельник: "в понедельник", вторник: "во вторник", среда: "в среду", четверг: "в четверг", пятница: "в пятницу", суббота: "в субботу", воскресенье: "в воскресенье" };
    const wd = date.toLocaleDateString("ru-RU", { weekday: "long", timeZone: "UTC" });
    const time = String(e.event_time).slice(0, 5);
    const kicker =
      dateTop === "сегодня" ? `Сегодня в ${time}. Пойдёшь со мной?` : dateTop === "завтра" ? `Завтра в ${time}. Пойдёшь со мной?` : `Иду ${WEEK_ACC[wd] ?? wd}. Пойдёшь со мной?`;
    // Название места без города в начале («Тюмень Ленина 46» → «Ленина 46»); если это и есть адрес — улицу не повторяем.
    const invPlace = placeName.replace(new RegExp(`^${city || "—"}[,\\s]+|[,\\s]+${city || "—"}$`, "gi"), "");
    const norm = (x: string) => x.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");
    const sameAsStreet = !!street && norm(street).includes(norm(invPlace).replace(/^ул(ица)?/, ""));
    const short = date.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "");
    return new ImageResponse(
      InviteStory({
        kicker,
        title: e.title ?? "",
        coverUrl: cover?.dataUrl ?? null,
        coverRatio: ratio,
        blurUrl: blur,
        glowUrl: blur ? glowSvg(blur, `data:image/png;base64,${glowMaskBuf.toString("base64")}`, 1080, ph + 160, 2.4, 1.45) : null,
        who: e.is_business && !e.is_anonymous ? { ...who, name: placeName || orgName } : who,
        catIcon: icon ? `data:image/png;base64,${icon.toString("base64")}` : null,
        when: dateTop === "сегодня" || dateTop === "завтра" ? dateTop : short,
        time,
        whereLabel: city ? `Где · ${city}` : "Где",
        place: e.is_anonymous ? "Скрыто" : invPlace || street || "Точка на карте",
        street: e.is_anonymous ? "после одобрения" : invPlace && !sameAsStreet ? street.replace(/^ул(ица)?\.?\s*/i, "") : "",
        free,
        seatsTotal: e.seats_total ?? 0,
        logo: `data:image/svg+xml;base64,${wordmark.toString("base64")}`,
        mosya: `data:image/png;base64,${mosyaBuf.toString("base64")}`,
        ig,
      }),
      { width: 1080, height: 1920, fonts, headers }
    );
  }

  return new ImageResponse(
    PhoneStory({
      title: e.title ?? "",
      description: e.description ?? null,
      coverUrl: cover?.dataUrl ?? null,
      coverRatio: cover?.ratio ?? 4 / 3,
      blurUrl: cover ? blurRaw : null,
      who,
      dateTop,
      day: date.getUTCDate(),
      month,
      time: String(e.event_time).slice(0, 5),
      city,
      place: e.is_anonymous ? "Место — после одобрения" : placeName || street || "Точка на карте",
      street: e.is_anonymous ? "" : placeName ? street : "",
      free,
      seatsWord: seatsWord(free),
      catIcon: icon ? `data:image/png;base64,${icon.toString("base64")}` : null,
      logo: `data:image/svg+xml;base64,${wordmark.toString("base64")}`,
      shadowRect: `data:image/png;base64,${shRect.toString("base64")}`,
      ig,
    }),
    {
      width: 1080,
      height: 1920,
      fonts: [
        { name: "Golos", data: medium, weight: 500, style: "normal" },
        { name: "Golos", data: bold, weight: 700, style: "normal" },
      ],
      headers: { "Server-Timing": `db;dur=${tDb}, img;dur=${Date.now() - t1}`, "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400" },
    }
  );
}
