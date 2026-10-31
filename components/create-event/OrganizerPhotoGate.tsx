"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Ic } from "@/components/proto/ui";
import { hasOrganizerPhoto, ORGANIZER_PHOTO_MESSAGE } from "@/lib/events/organizer-photo";
import { resizeImageFile } from "@/lib/photos/resize-image-client";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { say } from "@/lib/mosya/peek";

/** Upload in place so a rejected publication never loses the event draft. */
export function OrganizerPhotoGate({ loading, error, onRetry, onBack, onUploaded }: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onBack: () => void;
  onUploaded: (avatarUrl: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const hinted = useRef(false);

  useEffect(() => {
    if (!loading && !error && !hinted.current) {
      hinted.current = true;
      say("Добавь своё фото, чтобы люди видели, кто приглашает их на встречу.", "think");
    }
  }, [loading, error]);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setUploadError(null);
    try {
      const photoBase64 = await resizeImageFile(file, 1200, 0.88);
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64 }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !hasOrganizerPhoto(data.avatarUrl)) {
        setUploadError(apiErrorText(data, "Не получилось сохранить фото. Попробуй ещё раз.", res.status));
        return;
      }
      onUploaded(data.avatarUrl);
    } catch {
      setUploadError("Не получилось загрузить фото. Проверь соединение и выбери фото ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="scr cr aurora up" data-id="create" data-testid="organizer-photo-gate">
    <div className="scroll" style={{ paddingBottom: 160 }}>
      <div className="head"><button className="rb gl" aria-label="Назад" onClick={onBack}><Ic n="back" /></button></div>
      <div className="pad" style={{ textAlign: "center", paddingTop: 32 }}>
        <h1 className="t">{loading ? "Проверяем профиль…" : error ? "Не удалось загрузить профиль" : "Добавь своё фото"}</h1>
        {!loading && <p className="sub">{error ? "Проверь соединение и попробуй ещё раз." : ORGANIZER_PHOTO_MESSAGE}</p>}
        {uploadError && <p role="alert" className="sub">{uploadError}</p>}
        {!loading && (error
          ? <button className="btn v" onClick={onRetry}>Попробовать снова</button>
          : <>
            <input ref={fileRef} type="file" accept="image/*" aria-label="Фото профиля" hidden onChange={upload} disabled={busy} />
            <button className="btn v" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "Сохраняем фото…" : "Добавить фото профиля"}</button>
          </>)}
      </div>
    </div>
  </section>;
}
