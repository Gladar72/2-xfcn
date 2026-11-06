"use client";

import type { Face, Palette, Shape } from "./characters";
import { Creature } from "./Creature";

/** Персонаж на сцене: подпись, x и y центра (в координатах экрана шириной 390), размер, форма. */
export type StageProp = [label: string, x: number, y: number, size: number, shape: Shape, pal: Palette, face: Face];

/**
 * Сцена онбординга/входа. Брендбук 2026: вместо цветных эмодзи-персонажей —
 * один живой Мося по центру сцены. Параметры прежние, чтобы экраны не менялись.
 */
export function AliveStage({
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
  return (
    <div className={className} style={{ position: "relative", height, display: "grid", placeItems: "center", ...style }} aria-hidden>
      <Creature size={Math.round(size * 1.35)} variant="e" />
    </div>
  );
}

/** Отдельный персонаж — теперь Мося-капля («hidden» — без глаз). */
export function Character({
  face = "smile",
  size = 60,
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
    <span className={className} style={{ display: "inline-block", width: size, height: size, ...style }} aria-hidden>
      <Creature size={size} variant={face === "hidden" ? "p" : "e"} />
    </span>
  );
}
