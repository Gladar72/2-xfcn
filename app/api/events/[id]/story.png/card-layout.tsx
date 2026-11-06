/**
 * Сторис «Поделиться» — как карточка в прототипе (06.11): фото на весь экран,
 * сверху белый логотип и плашка «Бег · Сб, 08:00», снизу название (Inter Light),
 * строка «Место · 3 из 10» и белая кнопка «Пойти со мной →». Всё выровнено по
 * одной левой линии (80 px). В версии ig — пунктирная рамка под стикер «Ссылка».
 * Satori: только flex и абсолютное позиционирование.
 */
export interface CardStoryData {
  chip: string;
  title: string;
  meta: string;
  cta: string;
  coverUrl: string | null;
  coverRatio: number;
  logo: string;
  ig: boolean;
}

const W = 1080;
const H = 1920;
const L = 80;
const INK = "#17141F";

export function CardStory(d: CardStoryData) {
  const ratio = d.coverRatio || 3 / 4;
  let fw = W;
  let fh = fw / ratio;
  if (fh < H) {
    fh = H;
    fw = fh * ratio;
  }
  fw = Math.ceil(fw * 1.02);
  fh = Math.ceil(fh * 1.02);
  const fx = Math.round((W - fw) / 2);
  const fy = Math.round((H - fh) / 2);

  const title = d.title.replace(/\s+/g, " ").trim();
  const len = title.length;
  const size = len <= 14 ? 124 : len <= 26 ? 104 : len <= 44 ? 86 : len <= 70 ? 70 : 58;
  const ctaTop = d.ig ? 1450 : 1560;
  const metaTop = ctaTop - 40 - 46;
  const titleBottom = metaTop - 26;

  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", background: INK, color: "#fff", fontFamily: "Inter" }}>
      {d.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.coverUrl} alt="" width={fw} height={fh} style={{ position: "absolute", left: fx, top: fy, width: fw, height: fh }} />
      ) : (
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", backgroundImage: "linear-gradient(160deg,#3A3646,#17141F)" }} />
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          display: "flex",
          backgroundImage: "linear-gradient(180deg, rgba(23,20,31,0.62) 0%, rgba(23,20,31,0.12) 24%, rgba(23,20,31,0.08) 40%, rgba(23,20,31,0.7) 62%, rgba(23,20,31,0.94) 84%, rgba(23,20,31,0.97) 100%)",
        }}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.logo} alt="" width={230} height={49} style={{ position: "absolute", left: L, top: 232, width: 230, height: 49 }} />
      <div style={{ position: "absolute", left: L, top: 316, display: "flex" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 66,
            padding: "0 30px",
            borderRadius: 33,
            background: "rgba(23,20,31,0.38)",
            border: "2px solid rgba(255,255,255,0.45)",
            fontSize: 30,
            fontWeight: 500,
            color: "#fff",
            maxWidth: W - 2 * L,
          }}
        >
          {d.chip}
        </div>
      </div>

      {/* Название прижато к строке места снизу. */}
      <div style={{ position: "absolute", left: L, width: W - 2 * L, top: 420, height: titleBottom - 420, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ display: "flex", flexWrap: "wrap", fontSize: size, fontWeight: 300, lineHeight: 1.06, letterSpacing: -size * 0.035, color: "#fff" }}>{title}</div>
      </div>
      <div style={{ position: "absolute", left: L, width: W - 2 * L, top: metaTop, display: "flex", fontSize: 34, fontWeight: 400, color: "rgba(255,255,255,0.86)" }}>{d.meta}</div>

      <div
        style={{
          position: "absolute",
          left: L,
          width: W - 2 * L,
          top: ctaTop,
          height: 108,
          borderRadius: 54,
          background: "#fff",
          color: INK,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 38,
          fontWeight: 600,
        }}
      >
        {d.cta}
      </div>

      {d.ig ? (
        <div
          style={{
            position: "absolute",
            left: (W - 360) / 2,
            top: ctaTop + 108 + 36,
            width: 360,
            height: 100,
            borderRadius: 50,
            border: "3px dashed rgba(255,255,255,0.6)",
            background: "rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            fontWeight: 500,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          ссылка
        </div>
      ) : null}
    </div>
  );
}
