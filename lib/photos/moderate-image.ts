/**
 * Проверка фото на наготу перед загрузкой — на нашем сервере в РФ
 * (сервис moderation из deploy/yandex/docker-compose.yml, открытая модель NudeNet).
 * Фото не передаются сторонним сервисам и не уходят за границу.
 *
 * Адрес сервиса — MODERATION_URL (по умолчанию http://moderation:8000/check
 * внутри docker-compose). Если сервис недоступен — не блокируем загрузку.
 */

export type ModerationResult =
  | { safe: true }
  | { safe: false; reason: string };

const URL = process.env.MODERATION_URL || "http://moderation:8000/check";

export async function moderateImage(buffer: Buffer, mimeType: string): Promise<ModerationResult> {
  if (process.env.MODERATION_URL === "off") return { safe: true };
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": mimeType || "application/octet-stream" },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      // Битая картинка или сбой сервиса — не мешаем пользователю, пишем в лог.
      console.error("moderateImage: сервис модерации вернул статус", res.status);
      return { safe: true };
    }
    const data = (await res.json()) as { safe?: boolean; reason?: string };
    return data.safe === false ? { safe: false, reason: data.reason || "nudity" } : { safe: true };
  } catch (err) {
    console.error("moderateImage: сервис модерации недоступен:", err);
    return { safe: true };
  }
}
