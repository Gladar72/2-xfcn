"use client";

/**
 * Уменьшает фото (по большей стороне до maxSide px) и пережимает в JPEG
 * перед превращением в base64 для отправки на сервер. Фото с телефона
 * может весить несколько МБ — в base64 это ещё на треть больше и легко
 * упирается в лимит размера запроса (реальный найденный случай: без
 * этого создание встречи с фото падало с невнятной "Проблема с
 * соединением", т.к. запрос не долетал до сервера вообще).
 */
export function resizeImageFile(file: File, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode_failed"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas_unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
