import type { createAdminClient } from "@/lib/supabase/admin";
import { moderateImage } from "@/lib/photos/moderate-image";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 МБ (телефон заранее ужимает до ~0,3–0,5 МБ)
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type UploadChatPhotoResult =
  | { ok: true; publicUrl: string }
  | { ok: false; error: "photo_too_large" | "photo_upload_failed" | "photo_invalid" | "photo_rejected" };

/**
 * Фото в сообщении чата — тот же паттерн, что и lib/photos/upload-event-photo.ts:
 * data URL → проверка размера и типа → модерация (Sightengine) → бакет
 * "chat-photos". Имя файла — случайный UUID: ссылку нельзя угадать, а
 * список файлов бакета посторонним недоступен (см. миграцию 0035).
 */
export async function uploadChatPhoto(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  dataUrl: string
): Promise<UploadChatPhotoResult> {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const mimeType = match?.[1];
  const base64Content = match?.[2];
  if (!mimeType || !base64Content || !ALLOWED_TYPES.has(mimeType)) return { ok: false, error: "photo_invalid" };

  const buffer = Buffer.from(base64Content, "base64");
  if (buffer.byteLength === 0) return { ok: false, error: "photo_invalid" };
  if (buffer.byteLength > MAX_PHOTO_BYTES) return { ok: false, error: "photo_too_large" };

  const moderation = await moderateImage(buffer, mimeType);
  if (!moderation.safe) return { ok: false, error: "photo_rejected" };

  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = `${conversationId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from("chat-photos")
    .upload(path, buffer, { contentType: mimeType, upsert: false });
  if (uploadError) return { ok: false, error: "photo_upload_failed" };

  const { data } = admin.storage.from("chat-photos").getPublicUrl(path);
  return { ok: true, publicUrl: data.publicUrl };
}
