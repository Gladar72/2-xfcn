"use client";

import { useEffect, useRef } from "react";
import { startAlive } from "./alive";
import { characterSvg, type Face, type Palette, type Shape } from "./characters";

/** Персонаж на сцене: подпись, x и y центра (в координатах экрана шириной 390), размер, форма. */
export type StageProp = [label: string, x: number, y: number, size: number, shape: Shape, pal: Palette, face: Face];

/**
 * Сцена с живым Мосей и эмодзи-персонажами (онбординг, вход).
 * Координаты заданы для ширины 390 и масштабируются под реальный экран.
 */
export function AliveStage({
  props,
  floor,
  height,
  size = 150,
  className,
  style,
}: {
  props: StageProp[];
  floor: number;
  height: number;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const key = props.map((p) => p[0]).join("|");

  useEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const k = (layer.clientWidth || 390) / 390;
    const els = Array.from(layer.querySelectorAll<HTMLElement>(".m-prop"));
    els.forEach((el, i) => {
      const [, x, y, s] = props[i];
      el.dataset.x = String(x * k);
      el.dataset.y = String(y);
      el.dataset.s = String(s);
      el.style.left = `${x * k - s / 2}px`;
      el.animate([{ transform: "scale(0) rotate(-30deg)" }, { transform: "none" }], {
        duration: 600,
        delay: i * 90,
        easing: "cubic-bezier(.34,1.56,.64,1)",
        fill: "backwards",
      });
    });
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const h = startAlive(layer, { floor, x: layer.clientWidth / 2, size });
    return () => h.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, floor, size]);

  return (
    <div ref={ref} className={`m-life ${className ?? ""}`} style={{ height, ...style }}>
      {props.map(([label, x, y, s, shape, pal, face], i) => (
        <button
          key={label + i}
          type="button"
          className={`m-prop ${y < 200 ? "fly" : ""}`}
          aria-label={label}
          style={{
            left: `calc(${(x / 390) * 100}% - ${s / 2}px)`,
            top: y - s / 2,
            width: s,
            height: s,
            animationDelay: `${(x % 7) / 10}s`,
          }}
        >
          <span dangerouslySetInnerHTML={{ __html: characterSvg(shape, pal, face, i * 7 + x) }} />
        </button>
      ))}
    </div>
  );
}

/** Отдельный неподвижный (но «дышащий») персонаж. */
export function Character({
  shape,
  pal,
  face = "smile",
  size = 60,
  seed = 1,
  className,
  style,
}: {
  shape: Shape;
  pal: Palette;
  face?: Face;
  size?: number;
  seed?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{ display: "inline-block", width: size, height: size, ...style }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: characterSvg(shape, pal, face, seed) }}
    />
  );
}
