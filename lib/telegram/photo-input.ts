import { InputFile } from "grammy";

/**
 * Фото для Telegram файлом, а не ссылкой. Серверы Telegram часто не могут
 * скачать картинку с нашего сервера в России («failed to get HTTP URL content»
 * или таймаут), поэтому качаем её сами и отправляем байтами. Не получилось —
 * возвращаем исходную ссылку (вдруг Telegram справится).
 */
export async function photoInput(url: string): Promise<InputFile | string> {
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const port = process.env.PORT || "3000";
  // Свои файлы (обложки-пресеты, карточки) берём напрямую у приложения — без выхода в интернет.
  const local = appUrl && url.startsWith(appUrl) ? `http://127.0.0.1:${port}${url.slice(appUrl.length) || "/"}` : url.startsWith("/") ? `http://127.0.0.1:${port}${url}` : null;
  for (const src of local ? [local, url] : [url]) {
    if (!/^https?:\/\//.test(src)) continue;
    try {
      const r = await fetch(src, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const type = r.headers.get("content-type") ?? "";
      if (!type.startsWith("image/")) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > 9_500_000) continue;
      const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
      return new InputFile(buf, `photo.${ext}`);
    } catch {
      /* пробуем следующий источник */
    }
  }
  return url;
}
