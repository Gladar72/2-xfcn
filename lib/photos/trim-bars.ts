/**
 * Убирает чёрные поля (letterbox) по краям афиши: организаторы часто грузят
 * картинку, у которой сверху и снизу (или по бокам) залиты чёрные полосы, —
 * в карточке и на экране события они выглядят как чёрные плашки. Срезаем
 * только почти однотонные чёрные полосы; тёмные фото без полей не трогаем.
 * sharp есть на сервере (Dockerfile); если его нет — возвращаем как было.
 */
const DARK_MEAN = 24;
const FLAT_STD = 10;

function edges(px: Uint8Array, w: number, h: number) {
  const row = (y: number) => {
    let s = 0;
    let s2 = 0;
    for (let x = 0; x < w; x++) {
      const v = px[y * w + x]!;
      s += v;
      s2 += v * v;
    }
    const m = s / w;
    return m < DARK_MEAN && Math.sqrt(Math.max(0, s2 / w - m * m)) < FLAT_STD;
  };
  const col = (x: number, y0: number, y1: number) => {
    let s = 0;
    let s2 = 0;
    const n = y1 - y0;
    for (let y = y0; y < y1; y++) {
      const v = px[y * w + x]!;
      s += v;
      s2 += v * v;
    }
    const m = s / n;
    return m < DARK_MEAN && Math.sqrt(Math.max(0, s2 / n - m * m)) < FLAT_STD;
  };
  let top = 0;
  while (top < h && row(top)) top++;
  let bottom = 0;
  while (bottom < h - top && row(h - 1 - bottom)) bottom++;
  let left = 0;
  while (left < w && col(left, top, h - bottom)) left++;
  let right = 0;
  while (right < w - left && col(w - 1 - right, top, h - bottom)) right++;
  // Мелочь (1–2 % — тонкая рамка) не трогаем; если «поле» больше половины — это не поле, а тёмное фото.
  const keepV = top + bottom >= h * 0.03 && h - top - bottom >= h * 0.5;
  const keepH = left + right >= w * 0.03 && w - left - right >= w * 0.5;
  let t = keepV ? top : 0;
  let b = keepV ? bottom : 0;
  // Волосок по самому краю (1–3 строки однотонного серого/чёрного — след от полей или рамки):
  // на скруглённой карточке он виден как полоска. Срезаем, если он заметно отличается от картинки под ним.
  const rowStat = (y: number) => {
    let s = 0;
    let s2 = 0;
    for (let x = 0; x < w; x++) {
      const v = px[y * w + x]!;
      s += v;
      s2 += v * v;
    }
    const m = s / w;
    return { m, sd: Math.sqrt(Math.max(0, s2 / w - m * m)) };
  };
  const hair = (from: number, dir: 1 | -1) => {
    const ref = rowStat(from + dir * 4).m;
    let k = 0;
    while (k < 3) {
      const r = rowStat(from + dir * k);
      if (r.sd < 8 && Math.abs(r.m - ref) > 25) k++;
      else break;
    }
    return k;
  };
  if (h - t - b > 20) {
    t += hair(t, 1);
    b += hair(h - 1 - b, -1);
  }
  return { top: t, bottom: b, left: keepH ? left : 0, right: keepH ? right : 0 };
}

export async function trimBlackBars(buffer: Buffer): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(buffer).rotate();
    const { data, info } = await img.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
    const e = edges(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
    if (!e.top && !e.bottom && !e.left && !e.right) return null;
    const out = await img
      .extract({ left: e.left, top: e.top, width: info.width - e.left - e.right, height: info.height - e.top - e.bottom })
      .jpeg({ quality: 88 })
      .toBuffer();
    return { buffer: out, mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}
