"use client";

import { useRef, useState } from "react";
import { resizeImageFile } from "@/lib/photos/resize-image-client";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { PhotoCropModal } from "@/components/create-event/PhotoCropModal";

/** Ответ сервера после загрузки: главное фото или список дополнительных. */
export type PhotoResult = { main: true; avatarUrl: string } | { main: false; photos: string[] };

/**
 * Выбор фото профиля → вертикальный редактор 3:4 → загрузка.
 * slot 0 — главное фото (аватар), остальные — дополнительные.
 * Возвращает pick(slot), окно редактора и номер слота, который сейчас грузится.
 */
export function useProfilePhoto({ onDone, onError }: { onDone: (r: PhotoResult) => void; onError: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const slot = useRef(0);
  const [crop, setCrop] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);

  function pick(s: number) {
    slot.current = s;
    input.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setCrop(await resizeImageFile(file, 2000, 0.92));
    } catch {
      onError("Не получилось открыть фото");
    }
  }

  async function upload(dataUrl: string) {
    const s = slot.current;
    setCrop(null);
    setBusySlot(s);
    try {
      const res = await fetch(s === 0 ? "/api/me/avatar" : "/api/me/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64: dataUrl }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(d.error === "photo_rejected" ? "Это фото не прошло проверку — выбери другое" : apiErrorText(d, "Не получилось загрузить фото", res.status));
        return;
      }
      onDone(s === 0 ? { main: true, avatarUrl: d.avatarUrl } : { main: false, photos: d.photos });
    } catch {
      onError("Проблема с соединением");
    } finally {
      setBusySlot(null);
    }
  }

  const ui = (
    <>
      <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
      {crop && (
        <PhotoCropModal
          src={crop}
          aspectRatio={3 / 4}
          title="Фото профиля"
          hint="Двигай и приближай пальцами. Фото будет вертикальным, как в профиле"
          onReplace={() => input.current?.click()}
          onCancel={() => setCrop(null)}
          onConfirm={upload}
        />
      )}
    </>
  );

  return { pick, ui, busySlot };
}
