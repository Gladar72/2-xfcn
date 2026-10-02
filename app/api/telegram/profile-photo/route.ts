import { NextRequest, NextResponse } from "next/server";
import { validateTelegramInitData } from "@/lib/telegram/validate-init-data";
import { fetchTelegramAvatarDataUrl } from "@/lib/telegram/profile-photo";

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
export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ photo: null });

  const body = await req.json().catch(() => null);
  if (typeof body?.initData !== "string") return NextResponse.json({ error: "missing_init_data" }, { status: 400 });
  const auth = validateTelegramInitData(body.initData, botToken);
  if (!auth.ok) return NextResponse.json({ error: "invalid_init_data" }, { status: 401 });

  return NextResponse.json({ photo: await fetchTelegramAvatarDataUrl(botToken, auth.data.user.id) });
}
