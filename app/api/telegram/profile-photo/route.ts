import { NextRequest, NextResponse } from "next/server";
import { validateTelegramInitData } from "@/lib/telegram/validate-init-data";

/**
 * POST /api/telegram/profile-photo
 * Body: { initData: string }
 *
 * Для анкеты при регистрации: берём текущую аватарку человека из Telegram
 * (getUserProfilePhotos → getFile) и отдаём её data URL — анкета сразу
 * показывает её на шаге «Фото», а человек может заменить на свою.
 * Если фото в Telegram нет или оно скрыто настройками приватности —
 * { photo: null }, и человек загружает своё.
 *
 * telegram_id берём только из проверенной initData. Ответ — само фото
 * этого же человека, ничего чужого наружу не уходит.
 */
const TARGET_SIZE = 640;

export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ photo: null });

  const body = await req.json().catch(() => null);
  if (typeof body?.initData !== "string") return NextResponse.json({ error: "missing_init_data" }, { status: 400 });
  const auth = validateTelegramInitData(body.initData, botToken);
  if (!auth.ok) return NextResponse.json({ error: "invalid_init_data" }, { status: 401 });

  try {
    const api = `https://api.telegram.org/bot${botToken}`;
    const photosRes = await fetch(`${api}/getUserProfilePhotos?user_id=${auth.data.user.id}&limit=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const photos = (await photosRes.json()) as {
      ok: boolean;
      result?: { photos: Array<Array<{ file_id: string; width: number; height: number }>> };
    };
    const sizes = photos.ok ? photos.result?.photos[0] : undefined;
    if (!sizes || sizes.length === 0) return NextResponse.json({ photo: null });

    // Самый маленький размер не меньше 640px, иначе самый большой из имеющихся.
    const sorted = [...sizes].sort((a, b) => a.width - b.width);
    const best = sorted.find((s) => s.width >= TARGET_SIZE) ?? sorted[sorted.length - 1];
    if (!best) return NextResponse.json({ photo: null });

    const fileRes = await fetch(`${api}/getFile?file_id=${encodeURIComponent(best.file_id)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const file = (await fileRes.json()) as { ok: boolean; result?: { file_path?: string } };
    const filePath = file.ok ? file.result?.file_path : undefined;
    if (!filePath) return NextResponse.json({ photo: null });

    const imgRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!imgRes.ok) return NextResponse.json({ photo: null });
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const mime = filePath.endsWith(".png") ? "image/png" : "image/jpeg";
    return NextResponse.json({ photo: `data:${mime};base64,${buffer.toString("base64")}` });
  } catch (err) {
    console.error("POST /api/telegram/profile-photo:", err);
    return NextResponse.json({ photo: null });
  }
}
