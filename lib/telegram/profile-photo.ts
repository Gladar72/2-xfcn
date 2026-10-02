/**
 * Текущая аватарка пользователя из Telegram как data URL (или null, если
 * её нет / скрыта настройками приватности). Через Bot API:
 * getUserProfilePhotos → getFile → скачивание файла.
 */
const TARGET_SIZE = 640;

export async function fetchTelegramAvatarDataUrl(botToken: string, telegramId: number): Promise<string | null> {
  try {
    const api = `https://api.telegram.org/bot${botToken}`;
    const photosRes = await fetch(`${api}/getUserProfilePhotos?user_id=${telegramId}&limit=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const photos = (await photosRes.json()) as {
      ok: boolean;
      result?: { photos: Array<Array<{ file_id: string; width: number; height: number }>> };
    };
    const sizes = photos.ok ? photos.result?.photos[0] : undefined;
    if (!sizes || sizes.length === 0) return null;
    const sorted = [...sizes].sort((x, y) => x.width - y.width);
    const best = sorted.find((s) => s.width >= TARGET_SIZE) ?? sorted[sorted.length - 1];
    if (!best) return null;
    const fileRes = await fetch(`${api}/getFile?file_id=${encodeURIComponent(best.file_id)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const file = (await fileRes.json()) as { ok: boolean; result?: { file_path?: string } };
    const filePath = file.ok ? file.result?.file_path : undefined;
    if (!filePath) return null;
    const imgRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!imgRes.ok) return null;
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const mime = filePath.endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.error("fetchTelegramAvatarDataUrl:", err);
    return null;
  }
}
