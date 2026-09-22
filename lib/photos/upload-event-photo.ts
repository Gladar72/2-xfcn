import type { createAdminClient } from "@/lib/supabase/admin";
import { moderateImage } from "@/lib/photos/moderate-image";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 МБ

export type UploadEventPhotoResult =
  | { ok: true; publicUrl: string }
  | { ok: false; error: "photo_too_large" | "photo_upload_failed" | "photo_invalid" | "photo_rejected" };

/**
 * Одна фотография события (пока только "Для бизнеса", см. запрос
 * пользователя) — тот же паттерн, что и lib/photos/upload-avatar.ts,
 * только свой bucket ("event-photos") и путь по id события.
 */
export async function uploadEventPhoto(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  dataUrl: string
): Promise<UploadEventPhotoResult> {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const mimeType = match?.[1];
  const base64Content = match?.[2];
  if (!mimeType || !base64Content) return { ok: false, error: "photo_invalid" };

  const buffer = Buffer.from(base64Content, "base64");

  if (buffer.byteLength > MAX_PHOTO_BYTES) {
    return { ok: false, error: "photo_too_large" };
  }

  // Модерация — см. lib/photos/upload-avatar.ts, тот же принцип.
  const moderation = await moderateImage(buffer, mimeType);
  if (!moderation.safe) {
    return { ok: false, error: "photo_rejected" };
  }

  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const path = `${eventId}/${Date.now()}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from("event-photos")
    .upload(path, buffer, { contentType: mimeType, upsert: true });

  if (uploadError) {
    return { ok: false, error: "photo_upload_failed" };
  }

  const { data } = admin.storage.from("event-photos").getPublicUrl(path);
  return { ok: true, publicUrl: data.publicUrl };
}
