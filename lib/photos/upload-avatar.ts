import type { createAdminClient } from "@/lib/supabase/admin";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 МБ

export type UploadAvatarResult =
  | { ok: true; publicUrl: string }
  | { ok: false; error: "photo_too_large" | "photo_upload_failed" | "photo_invalid" };

/**
 * Принимает data URL (data:image/...;base64,...), сохраняет в Storage
 * bucket "avatars" и возвращает публичную ссылку. Используется и при
 * регистрации (app/api/users), и при смене фото из профиля (app/api/me/avatar).
 */
export async function uploadAvatar(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  dataUrl: string
): Promise<UploadAvatarResult> {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  // tsconfig имеет noUncheckedIndexedAccess: true, поэтому match[1]/match[2]
  // типизированы как `string | undefined`, хотя regex гарантирует их наличие
  // при успешном match — явная проверка вместо non-null assertion.
  const mimeType = match?.[1];
  const base64Content = match?.[2];
  if (!mimeType || !base64Content) return { ok: false, error: "photo_invalid" };

  const buffer = Buffer.from(base64Content, "base64");

  if (buffer.byteLength > MAX_PHOTO_BYTES) {
    return { ok: false, error: "photo_too_large" };
  }

  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const path = `${userId}/${Date.now()}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, buffer, { contentType: mimeType, upsert: true });

  if (uploadError) {
    return { ok: false, error: "photo_upload_failed" };
  }

  const { data } = admin.storage.from("avatars").getPublicUrl(path);
  return { ok: true, publicUrl: data.publicUrl };
}
