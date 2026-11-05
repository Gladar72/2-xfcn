"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

interface PhotoCropModalProps {
  src: string;
  /** Ширина/высота итогового кадра: 2/3 — обложка встречи, 3/4 — фото профиля. */
  aspectRatio: number;
  /** Заголовок сверху: «Обложка встречи», «Фото профиля». */
  title?: string;
  /** Подсказка под рамкой. */
  hint?: string;
  /** Показать в рамке, как будет выглядеть карточка (название и строка под ним). */
  preview?: { title: string; meta?: string } | null;
  /** «Заменить» — выбрать другое фото (если не передано, кнопки нет). */
  onReplace?: () => void;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string) => void;
}

const MAX_SCALE = 4;

/**
 * Вертикальный редактор фото перед загрузкой — как в Instagram/Telegram:
 * фото двигается пальцем, двумя пальцами (или колесом мыши) приближается,
 * пока двигаешь — видна сетка. Есть «Повернуть», «Сбросить», «Заменить».
 * Сохраняет кадр нужных пропорций, без сторонних библиотек.
 */
export function PhotoCropModal({ src, aspectRatio, title = "Обложка встречи", hint, preview, onReplace, onCancel, onConfirm }: PhotoCropModalProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [source, setSource] = useState(src);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [rendering, setRendering] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; scale: number; cx: number; cy: number; ox: number; oy: number } | null>(null);
  // Окно рисуем прямо в <body>: внутри экрана (.scr с анимацией) «fixed»
  // считается от экрана, и нижние кнопки перекрывал таббар.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => setSource(src), [src]);

  // Рамка — самая большая вертикальная рамка нужных пропорций, что влезает в сцену.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      const maxW = Math.min(width - 32, 440);
      const maxH = height - 24;
      let w = maxW;
      let h = w / aspectRatio;
      if (h > maxH) {
        h = maxH;
        w = h * aspectRatio;
      }
      setFrame({ w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspectRatio, mounted]);

  // Базовый размер картинки — как object-fit:cover при scale=1 (рамка заполнена целиком).
  function base(n = nat) {
    if (!n || !frame.w) return { w: frame.w, h: frame.h };
    const fr = frame.w / frame.h;
    const nr = n.w / n.h;
    return nr > fr ? { w: frame.h * nr, h: frame.h } : { w: frame.w, h: frame.w / nr };
  }

  function clamp(o: { x: number; y: number }, s: number) {
    const b = base();
    const maxX = Math.max(0, (b.w * s - frame.w) / 2);
    const maxY = Math.max(0, (b.h * s - frame.h) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) };
  }

  function startGesture() {
    const pts = [...pointers.current.values()];
    if (pts.length === 0) {
      gesture.current = null;
      return;
    }
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0;
    gesture.current = { dist, scale, cx, cy, ox: offset.x, oy: offset.y };
  }

  function onDown(e: ReactPointerEvent<HTMLDivElement>) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
    startGesture();
  }

  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    let s = scale;
    if (pts.length > 1 && g.dist > 0) {
      const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      s = Math.min(MAX_SCALE, Math.max(1, (g.scale * d) / g.dist));
      setScale(s);
    }
    setOffset(clamp({ x: g.ox + (cx - g.cx), y: g.oy + (cy - g.cy) }, s));
  }

  function onUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setDragging(false);
    startGesture();
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    const s = Math.min(MAX_SCALE, Math.max(1, scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    setScale(s);
    setOffset((o) => clamp(o, s));
  }

  function reset() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  // Поворот на 90° — переворачиваем само фото на холсте, дальше работаем с ним.
  function rotate() {
    const img = imgRef.current;
    if (!img || !nat) return;
    const c = document.createElement("canvas");
    const k = Math.min(1, 2400 / Math.max(nat.w, nat.h));
    c.width = Math.round(nat.h * k);
    c.height = Math.round(nat.w * k);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.translate(c.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0, nat.w * k, nat.h * k);
    setNat(null);
    reset();
    setSource(c.toDataURL("image/jpeg", 0.92));
  }

  function confirm() {
    const img = imgRef.current;
    if (!img || !nat || !frame.w) return;
    setRendering(true);
    const b = base();
    // Выходной кадр — фиксированное разрешение по нужным пропорциям.
    const outW = 1080;
    const outH = Math.round(outW / aspectRatio);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setRendering(false);
      return;
    }
    const f = outW / frame.w;
    const dw = b.w * scale * f;
    const dh = b.h * scale * f;
    ctx.drawImage(img, outW / 2 - dw / 2 + offset.x * f, outH / 2 - dh / 2 + offset.y * f, dw, dh);
    const url = canvas.toDataURL("image/jpeg", 0.88);
    setRendering(false);
    onConfirm(url);
  }

  if (!mounted) return null;
  const b = base();
  const grid =
    "linear-gradient(90deg,transparent calc(33.33% - .5px),rgba(255,255,255,.5) 33.33%,transparent calc(33.33% + .5px),transparent calc(66.66% - .5px),rgba(255,255,255,.5) 66.66%,transparent calc(66.66% + .5px))," +
    "linear-gradient(180deg,transparent calc(33.33% - .5px),rgba(255,255,255,.5) 33.33%,transparent calc(33.33% + .5px),transparent calc(66.66% - .5px),rgba(255,255,255,.5) 66.66%,transparent calc(66.66% + .5px))";
  const pill: React.CSSProperties = { height: 38, padding: "0 16px", borderRadius: 19, border: 0, background: "rgba(255,255,255,.12)", color: "#fff", font: "inherit", fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" };
  const tool: React.CSSProperties = { ...pill, height: 40, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 };
  const ic = (d: string) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: "flex",
        flexDirection: "column",
        background: "#0C0716",
        color: "#fff",
        fontFamily: "var(--f, inherit)",
        paddingTop: "max(env(safe-area-inset-top, 0px), var(--tg-content-safe-area-inset-top, 0px), 12px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 16px" }}>
        <button type="button" onClick={onCancel} style={pill}>
          Отмена
        </button>
        <b style={{ fontSize: 16, fontWeight: 600 }}>{title}</b>
        <button
          type="button"
          onClick={confirm}
          disabled={!nat || rendering}
          style={{ ...pill, background: "linear-gradient(120deg,#6C3BFF,#A24DFF 48%,#FF6FA0)", fontWeight: 600, opacity: !nat || rendering ? 0.6 : 1 }}
        >
          {rendering ? "…" : "Готово"}
        </button>
      </div>

      <div ref={stageRef} style={{ position: "relative", flex: 1, minHeight: 0, display: "grid", placeItems: "center", overflow: "hidden" }}>
        <div
          ref={frameRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onWheel={onWheel}
          onDoubleClick={reset}
          style={{
            position: "relative",
            width: frame.w,
            height: frame.h,
            borderRadius: 22,
            overflow: "hidden",
            touchAction: "none",
            userSelect: "none",
            background: "#000",
            boxShadow: "0 0 0 2px #fff",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={source}
            alt=""
            draggable={false}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              maxWidth: "none",
              width: b.w || "100%",
              height: b.h || "100%",
              transform: `translate(-50%,-50%) translate(${offset.x}px,${offset.y}px) scale(${scale})`,
              pointerEvents: "none",
            }}
          />
          {preview && (
            <>
              <span aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,transparent 55%,rgba(14,8,28,.85))", pointerEvents: "none" }} />
              <span aria-hidden style={{ position: "absolute", left: 14, right: 14, bottom: 14, pointerEvents: "none" }}>
                <b style={{ display: "block", fontSize: 18, fontWeight: 600, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview.title || "Название встречи"}</b>
                {preview.meta && <span style={{ fontSize: 12.5, opacity: 0.85 }}>{preview.meta}</span>}
              </span>
            </>
          )}
          <span aria-hidden style={{ position: "absolute", inset: 0, background: grid, opacity: dragging ? 1 : 0, transition: "opacity .2s", pointerEvents: "none" }} />
        </div>
      </div>

      <div style={{ padding: "12px 20px", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 20px)", display: "grid", gap: 14 }}>
        <p style={{ margin: 0, textAlign: "center", fontSize: 13, lineHeight: 1.4, color: "rgba(255,255,255,.65)" }}>
          {hint ?? "Двигай фото пальцем, двумя пальцами — приблизить"}
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={rotate} disabled={!nat} style={tool}>
            {ic("M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4")}
            Повернуть
          </button>
          <button type="button" onClick={reset} style={tool}>
            {ic("M9 4H5v4M15 4h4v4M9 20H5v-4M15 20h4v-4")}
            Сбросить
          </button>
          {onReplace && (
            <button type="button" onClick={onReplace} style={tool}>
              {ic("M4 7h3l2-2.5h6L17 7h3v12H4zM12 10.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z")}
              Заменить
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
