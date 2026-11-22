"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Sheet } from "@/components/proto/ui";
import { PhotoCropModal } from "@/components/create-event/PhotoCropModal";
import { useProfilePhoto } from "./useProfilePhoto";
import { photoThumb } from "@/lib/photos/thumb";
import "./profile-gallery.css";

export function ProfileGallery({ avatar, photos, onChange, flash }: {
  avatar: string | null; photos?: string[]; onChange: (photos: string[]) => void; flash: (text: string) => void;
}) {
  const ordered = Array.from(new Set([avatar, ...(photos ?? [])].filter((url): url is string => !!url))).slice(0, 3);
  const [selected, setSelected] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ url: string; src: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<number | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const photo = useProfilePhoto({
    onDone: result => onChange(result.main ? [result.avatarUrl, ...ordered.slice(1)] : result.photos), onError: flash,
  });
  const locked = busy || photo.busySlot !== null;

  async function save(method: "PATCH" | "DELETE" | "PUT", body: object) {
    if (locked) return;
    setBusy(true);
    setSelected(null);
    try {
      const res = await fetch("/api/me/photos", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await res.json();
      if (!res.ok || !Array.isArray(result.photos)) throw new Error("update");
      onChange(result.photos);
    } catch { flash(method === "DELETE" ? "Не удалось удалить фото. Попробуй ещё раз." : "Не удалось сохранить изменение. Открой профиль заново, чтобы сверить фотографии."); }
    finally { setBusy(false); }
  }

  function move(from: number, to: number) {
    if (!ordered[from] || !ordered[to] || from === to) return;
    const next = [...ordered];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    void save("PATCH", { before: ordered, photos: next });
  }
  function drop(e: PointerEvent<HTMLButtonElement>) {
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-photo-index]");
    if (moving !== null && target && grid.current?.contains(target)) move(moving, Number(target.dataset.photoIndex));
    setMoving(null);
  }

  async function edit(url: string) {
    setBusy(true);
    try {
      const res = await fetch(photoThumb(url, 650, true), { credentials: "same-origin" });
      if (!res.ok) throw new Error("image");
      const src = URL.createObjectURL(await res.blob());
      setSelected(null);
      setCrop({ url, src });
    } catch { flash("Не удалось открыть фото для редактирования."); }
    finally { setBusy(false); }
  }
  function closeCrop() {
    if (crop) URL.revokeObjectURL(crop.src);
    setCrop(null);
  }

  return <>
    <div ref={grid} className="profile-gallery">
      {ordered.map((url, i) => <div key={url} data-photo-index={i} className="gallery-tile" data-moving={moving === i || undefined}>
        <button className="gallery-image" aria-label={i === 0 ? "Главное фото" : "Фото " + (i + 1)} disabled={locked} onClick={() => setSelected(url)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoThumb(url, 400)} alt="" />{i === 0 && <span>Главное</span>}
        </button>
        {ordered.length > 1 && <button className="gallery-grip" aria-label={"Переместить фото " + (i + 1)} disabled={locked}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setMoving(i); }}
          onPointerUp={drop} onPointerCancel={() => setMoving(null)} onClick={e => { if (e.detail === 0) setSelected(url); }}>⠿</button>}
      </div>)}
      {ordered.length < 3 && <button className="gallery-add gl" aria-label="Добавить фото" disabled={locked} onClick={() => photo.pick(ordered.length)}>+</button>}
    </div>
    {photo.ui}
    <Sheet cls="gallery-action-sheet" open={selected !== null} onClose={() => setSelected(null)}>
      <h2>Фото профиля</h2>
      {selected && <div className="gallery-actions">
        <button className="btn v" disabled={locked} onClick={() => edit(selected)}>Изменить кадр</button>
        {ordered.indexOf(selected) > 0 && <button className="btn o" disabled={locked} onClick={() => move(ordered.indexOf(selected), 0)}>Сделать главным</button>}
        {ordered.indexOf(selected) === 0
          ? <button className="btn o" disabled={locked} onClick={() => { setSelected(null); photo.pick(0); }}>Заменить главное фото</button>
          : <button className="btn o" disabled={locked} onClick={() => save("DELETE", { url: selected })}>Удалить фото</button>}
      </div>}
    </Sheet>
    {crop && <PhotoCropModal src={crop.src} aspectRatio={3 / 4} title="Фото профиля" onCancel={closeCrop}
      onConfirm={data => { const url = crop.url; closeCrop(); void save("PUT", { url, photoBase64: data }); }} />}
  </>;
}
