
/** Story and preview share one left edge and plain Inter text. */
export interface CardStoryData {
  chip: string;
  title: string;
  description?: string | null;
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

  // В сторис — только заголовок встречи (описание бывает длинным и не помещается).
  const heading = d.title.replace(/\s+/g, " ").trim();
  const headingSize = heading.length <= 24 ? 76 : heading.length <= 48 ? 64 : 54;
  // Кнопки «Пойти» на картинке нет: в Instagram её заменяет стикер «Ссылка» (значок ниже),
  // в Telegram — кнопка «Я иду» самой сторис. Текст опущен к низу, над значком ссылки.
  const linkTop = 1560;
  const textBottom = d.ig ? linkTop - 24 : 1720;

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
          backgroundImage: "linear-gradient(180deg, rgba(23,20,31,0.62) 0%, rgba(23,20,31,0.12) 24%, rgba(23,20,31,0.06) 38%, rgba(23,20,31,0.84) 60%, rgba(23,20,31,0.96) 76%, rgba(23,20,31,0.98) 100%)",
        }}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.logo} alt="" width={230} height={49} style={{ position: "absolute", left: L, top: 232, width: 230, height: 49 }} />
      <div style={{ position: "absolute", left: L, top: 316, display: "flex" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 38,
            lineHeight: 1.4,
            fontWeight: 500,
            color: "#fff",
            maxWidth: W - 2 * L,
          }}
        >
          {d.chip}
        </div>
      </div>

      <div style={{ position: "absolute", left: L, width: W - 2 * L, bottom: H - textBottom, display: "flex", flexDirection: "column", gap: 26, fontSize: 38, fontWeight: 400, lineHeight: 1.4 }}>
        {heading && <div style={{ display: "flex", overflow: "hidden", maxHeight: headingSize * 3.3, wordBreak: "break-word", fontSize: headingSize, fontWeight: 600, lineHeight: 1.08, letterSpacing: -1.5 }}>{heading}</div>}
        {d.meta && <div style={{ display: "flex", color: "rgba(255,255,255,0.86)", wordBreak: "break-word" }}>{d.meta}</div>}
      </div>

      {d.ig ? (
        <div
          style={{
            position: "absolute",
            left: (W - 360) / 2,
            top: linkTop,
            width: 360,
            height: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            fontWeight: 500,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
        </div>
      ) : null}
    </div>
  );
}
