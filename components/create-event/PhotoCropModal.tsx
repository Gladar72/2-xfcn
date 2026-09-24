"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

interface PhotoCropModalProps {
  src: string;
  /** Ширина/высота итогового кадра, напр. 1.4 (как у карточки события). */
  aspectRatio: number;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string) => void;
}

/**
 * Простая обрезка фото перед загрузкой — перетаскивание и зум пальцем/
 * мышью внутри рамки нужных пропорций, без сторонних библиотек (в
 * песочнице нет доступа к npm-реестру, чтобы поставить что-то вроде
 * react-easy-crop).
 */
export function PhotoCropModal({ src, aspectRatio, onCancel, onConfirm }: PhotoCropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(
    null
  );
  const [rendering, setRendering] = useState(false);

  // Базовый размер картинки внутри рамки — как object-fit:cover при
  // scale=1 (заполняет рамку целиком, без пустых полей), дальше scale
  // только увеличивает сверху этого.
  function baseCoverSize(containerW: number, containerH: number, natW: number, natH: number) {
    const containerRatio = containerW / containerH;
    const natRatio = natW / natH;
    if (natRatio > containerRatio) {
      // Картинка шире рамки по пропорциям — высота совпадает, ширина больше.
      return { w: containerH * natRatio, h: containerH };
    }
    return { w: containerW, h: containerW / natRatio };
  }

  function clampOffset(next: { x: number; y: number }, currentScale: number) {
    const container = containerRef.current;
    if (!container || !naturalSize) return next;
    const { width: cw, height: ch } = container.getBoundingClientRect();
    const base = baseCoverSize(cw, ch, naturalSize.w, naturalSize.h);
    const scaledW = base.w * currentScale;
    const scaledH = base.h * currentScale;
    const maxX = Math.max(0, (scaledW - cw) / 2);
    const maxY = Math.max(0, (scaledH - ch) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragState.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offset.x, startOffsetY: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset(clampOffset({ x: dragState.current.startOffsetX + dx, y: dragState.current.startOffsetY + dy }, scale));
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  function handleScaleChange(next: number) {
    setScale(next);
    setOffset((prev) => clampOffset(prev, next));
  }

  function handleConfirm() {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !naturalSize) return;
    setRendering(true);
    const { width: cw, height: ch } = container.getBoundingClientRect();
    const base = baseCoverSize(cw, ch, naturalSize.w, naturalSize.h);
    const scaledW = base.w * scale;
    const scaledH = base.h * scale;

    // Выходной холст — фиксированное разрешение по нужным пропорциям
    // (не завязано на экран пользователя, чтобы качество было стабильным).
    const outW = 1200;
    const outH = Math.round(outW / aspectRatio);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setRendering(false);
      return;
    }
    // Пересчитываем экранные координаты (позиция+масштаб внутри рамки) в
    // координаты выходного холста той же пропорции.
    const factor = outW / cw;
    const drawW = scaledW * factor;
    const drawH = scaledH * factor;
    const drawX = outW / 2 - drawW / 2 + offset.x * factor;
    const drawY = outH / 2 - drawH / 2 + offset.y * factor;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setRendering(false);
    onConfirm(dataUrl);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 p-4">
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative w-full max-w-md touch-none select-none overflow-hidden rounded-card-lg bg-black"
          style={{ aspectRatio: String(aspectRatio) }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
            }}
            className="absolute left-1/2 top-1/2 max-w-none"
            style={{
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              width: naturalSize
                ? `${baseCoverSize(containerRef.current?.clientWidth ?? 1, containerRef.current?.clientHeight ?? 1, naturalSize.w, naturalSize.h).w}px`
                : "100%",
              height: naturalSize
                ? `${baseCoverSize(containerRef.current?.clientWidth ?? 1, containerRef.current?.clientHeight ?? 1, naturalSize.w, naturalSize.h).h}px`
                : "100%",
            }}
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-md shrink-0 space-y-4 pb-[env(safe-area-inset-bottom,0px)] pt-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/70">−</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={scale}
            onChange={(e) => handleScaleChange(Number(e.target.value))}
            className="h-1 flex-1 accent-accent"
          />
          <span className="text-xs text-white/70">+</span>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-pill bg-white/10 py-3 text-sm font-medium text-white"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!naturalSize || rendering}
            className="flex-1 rounded-pill bg-brand-gradient py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {rendering ? "Готовим..." : "Готово"}
          </button>
        </div>
      </div>
    </div>
  );
}
