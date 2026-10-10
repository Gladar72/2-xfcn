/**
 * Эмодзи-персонажи «Места»: мягкие глянцевые фигурки с лицами
 * (облачко, подушка, искра, пузырь…). Рисуются SVG-строкой, чтобы
 * их можно было вставлять и в React, и в «живой» слой с Мосей.
 */

const PI = Math.PI;

function petals(n: number, rIn: number, rOut: number, rot: number) {
  const q = (a: number, r: number) => `${(60 + r * Math.cos(a)).toFixed(1)} ${(60 + r * Math.sin(a)).toFixed(1)}`;
  let d = "";
  for (let i = 0; i < n; i++) {
    const t = rot + (i * 2 * PI) / n;
    const a0 = t - PI / n;
    const a1 = t + PI / n;
    if (!i) d += "M" + q(a0, rIn);
    d += " Q" + q(t, rOut) + " " + q(a1, rIn);
  }
  return d + "Z";
}

export const SHAPES = {
  flower: petals(8, 36, 58, -PI / 2),
  clover: petals(4, 22, 64, -PI / 4),
  star: petals(4, 20, 60, -PI / 2),
  blob: "M60 8c22 0 40 10 46 30s-2 50-22 62-48 10-62-8S6 46 18 28 38 8 60 8z",
  squ: "M28 12h64a16 16 0 0 1 16 16v64a16 16 0 0 1-16 16H28a16 16 0 0 1-16-16V28a16 16 0 0 1 16-16z",
  ball: "M60 10a50 50 0 1 1 0 100 50 50 0 0 1 0-100z",
  cloud: "M30 100C14 100 8 80 20 72C8 62 16 42 34 44C32 28 50 16 64 24C78 10 102 22 98 42C112 46 114 68 102 74C112 86 102 102 88 100Z",
} as const;

export const PALETTES = {
  sky: ["#BFE2FF", "#5AA9FF"],
  pink: ["#FFC2E4", "#FF5FAE"],
  violet: ["#D6C6FF", "#7A4BFF"],
  peach: ["#FFE0C4", "#FF9A55"],
  lilac: ["#F1DBFF", "#B46CFF"],
  mint: ["#D2FFF0", "#3CCB9A"],
} as const;

const INK = "#2A2245";
export const FACES = {
  smile: (e: number) =>
    `<g class="eye"><circle cx="48" cy="${e}" r="4.2" fill="${INK}"/><circle cx="72" cy="${e}" r="4.2" fill="${INK}"/></g><path d="M54 ${e + 10} q6 6 12 0" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`,
  calm: (e: number) =>
    `<path d="M42 ${e} q6 5 12 0M66 ${e} q6 5 12 0" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M53 ${e + 11} q7 6 14 0" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`,
  wow: (e: number) =>
    `<g class="eye"><ellipse cx="47" cy="${e}" rx="9" ry="9.5" fill="#fff"/><ellipse cx="73" cy="${e}" rx="9" ry="9.5" fill="#fff"/><g class="pp"><circle cx="48" cy="${e + 1}" r="4.4" fill="${INK}"/><circle cx="74" cy="${e + 1}" r="4.4" fill="${INK}"/></g></g><ellipse cx="60" cy="${e + 16}" rx="4" ry="3.4" fill="${INK}"/>`,
  sly: (e: number) =>
    `<g class="eye"><circle cx="48" cy="${e}" r="4" fill="${INK}"/><circle cx="72" cy="${e}" r="4" fill="${INK}"/></g><path d="M52 ${e + 12} q8 2 16 -3" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`,
  hidden: (e: number) =>
    `<path d="M40 ${e + 1} q8 -6 16 0M64 ${e + 1} q8 -6 16 0" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M55 ${e + 12} h10" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`,
} as const;

export type Shape = keyof typeof SHAPES;
export type Palette = keyof typeof PALETTES;
export type Face = keyof typeof FACES;

let cid = 0;
/** SVG-разметка персонажа. Значения анимации чуть случайные, чтобы фигурки «дышали» вразнобой. */
export function characterSvg(shape: Shape, pal: Palette, face: Face = "smile", seed?: number) {
  const id = seed === undefined ? "cg" + cid++ : `cg${shape}${pal}${Math.round(seed)}`;
  const [c1, c2] = PALETTES[pal];
  const rnd = seed === undefined ? Math.random : mulberry(seed);
  const bt = (3 + rnd() * 1.6).toFixed(2);
  const bk = (3.6 + rnd() * 3).toFixed(2);
  const bd = (-rnd() * 4).toFixed(2);
  const e = shape === "cloud" ? 66 : shape === "star" ? 58 : 60;
  return `<svg class="m-chr" viewBox="0 0 120 120" aria-hidden="true" style="--bt:${bt}s;--bk:${bk}s;--bd:${bd}s"><defs><radialGradient id="${id}" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs><g class="body"><path d="${SHAPES[shape]}" fill="url(#${id})"/><ellipse cx="38" cy="${e + 12}" rx="6" ry="3.5" fill="#fff" opacity=".35"/><ellipse cx="82" cy="${e + 12}" rx="6" ry="3.5" fill="#fff" opacity=".35"/>${FACES[face](e)}</g></svg>`;
}

function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Состав персонажей (тот же, что в прототипе). */
export const CAST: [Shape, Palette, Face, string][] = [
  ["flower", "sky", "smile", "Облачко"],
  ["squ", "pink", "calm", "Подушка"],
  ["clover", "violet", "wow", "Клевер"],
  ["star", "peach", "sly", "Искра"],
  ["ball", "lilac", "calm", "Пузырь"],
  ["cloud", "mint", "smile", "Туча"],
  ["blob", "pink", "wow", "Капля"],
  ["flower", "peach", "calm", "Цветок"],
];
