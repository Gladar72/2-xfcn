/**
 * Сторис «Поделиться событием» — «Афиша» (согласовано 29.10).
 * Фото встречи на весь экран, затемнение сверху и снизу, сверху белый логотип и
 * «Аня зовёт · пойдёшь?», внизу огромное название (Oswald, заглавные), под ним три
 * плашки: Когда / Где / Ещё N мест, и узкая рамка «ссылка» под стикер Instagram.
 * Satori: только flex и картинки.
 */
export interface PosterStoryData {
  who: string;
  ask: string;
  title: string;
  coverUrl: string | null;
  coverRatio: number;
  when: string;
  where: string;
  seats: string;
  logo: string;
}

const violet = "#6C3BFF";
const W = 1080;
const H = 1920;

export function PosterStory(d: PosterStoryData) {
  // Фото заполняет весь экран без полей: считаем «cover» сами (Satori не всегда его соблюдает).
  const ratio = d.coverRatio || 3 / 4;
  const fit = (() => {
    let w = W;
    let h = w / ratio;
    if (h < H) {
      h = H;
      w = h * ratio;
    }
    w = Math.ceil(w * 1.02);
    h = Math.ceil(h * 1.02);
    return { w, h, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2) };
  })();

  // Число и единица («10 км», «5 мин») не разрываются по строкам — неразрывный пробел.
  const t = d.title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(\d+)\s+(км|м|мин|ч|час|часа|кг|лет|года?|₽|руб\.?)(?=\s|$|[.,!?])/gi, "$1\u00a0$2")
    .toUpperCase();
  const longest = Math.max(...t.split(" ").map((s) => s.length), 1); // «10\u00a0КМ» считается одним словом
  // Узкий Oswald: одна буква ≈ 0,5 кегля. Слово целиком должно влезать в 940 px, строк — не больше 4.
  let size = t.length <= 12 ? 190 : t.length <= 24 ? 150 : t.length <= 40 ? 120 : 96;
  size = Math.min(size, Math.floor(940 / (longest * 0.52)));
  const perLine = Math.max(1, Math.floor(940 / (size * 0.5)));
  let lines = 1;
  let cur = 0;
  for (const w of t.split(" ")) {
    if (cur === 0) cur = w.length;
    else if (cur + 1 + w.length <= perLine) cur += 1 + w.length;
    else {
      lines += 1;
      cur = w.length;
    }
  }
  while (lines > 4 && size > 64) {
    size -= 8;
    lines = Math.ceil(t.length / Math.max(1, Math.floor(940 / (size * 0.5))));
  }

  const PLATES_TOP = 1450;
  const plate = (label: string, value: string, accent?: boolean) => (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "22px 26px",
        borderRadius: 30,
        background: accent ? violet : "rgba(255,255,255,0.16)",
        border: accent ? "1.5px solid " + violet : "1.5px solid rgba(255,255,255,0.4)",
        color: "#fff",
        marginLeft: label === "Когда" ? 0 : 16,
      }}
    >
      <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, color: accent ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.7)", fontWeight: 500 }}>{label.toUpperCase()}</div>
      <div style={{ display: "flex", fontSize: value.length > 12 ? 30 : 36, fontWeight: 700, marginTop: 6, lineHeight: 1.1 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", background: "#16121F", color: "#fff", fontFamily: "Golos" }}>
      {d.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.coverUrl} alt="" width={fit.w} height={fit.h} style={{ position: "absolute", left: fit.x, top: fit.y, width: fit.w, height: fit.h }} />
      ) : (
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", backgroundImage: "linear-gradient(160deg,#4B1FB8,#6C3BFF 50%,#A24DFF 80%,#FF6FA0)" }} />
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          display: "flex",
          backgroundImage: "linear-gradient(180deg, rgba(22,18,31,0.78) 0%, rgba(22,18,31,0.1) 30%, rgba(22,18,31,0.15) 50%, rgba(22,18,31,0.92) 80%, rgba(22,18,31,0.95) 100%)",
        }}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.logo} alt="" width={200} height={42} style={{ position: "absolute", left: 440, top: 230, width: 200, height: 42 }} />
      <div style={{ position: "absolute", left: 0, top: 318, width: W, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 54, fontWeight: 700, letterSpacing: -1 }}>
        <div style={{ display: "flex" }}>{d.who}</div>
        <div style={{ display: "flex", marginLeft: 16, padding: "0 14px", borderRadius: 12, background: violet }}>{d.ask}</div>
      </div>

      {/* Название прижато к плашкам снизу: высоту строк считает сам Satori, текст не наезжает на плашки. */}
      <div style={{ position: "absolute", left: 70, width: 940, top: 430, height: PLATES_TOP - 64 - 430, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ display: "flex", flexWrap: "wrap", fontFamily: "Oswald", fontSize: size, fontWeight: 700, lineHeight: 1.02, color: "#fff" }}>{t}</div>
      </div>

      <div style={{ position: "absolute", left: 70, width: 940, top: PLATES_TOP, display: "flex" }}>
        {plate("Когда", d.when)}
        {plate("Где", d.where)}
        {plate("Ещё", d.seats, true)}
      </div>

      <div
        style={{
          position: "absolute",
          left: 390,
          top: 1625,
          width: 300,
          height: 96,
          borderRadius: 48,
          border: "3px dashed rgba(255,255,255,0.6)",
          background: "rgba(255,255,255,0.12)",
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
    </div>
  );
}
