/**
 * Сторис «Поделиться событием» в виде телефона на белом фоне (вариант, согласованный 20.10).
 * В телефоне — фото встречи на весь экран, поверх: кто зовёт, название, описание, кнопки.
 * Вокруг — карточки: дата, где (город / место / улица), сколько мест нужно. Внизу — «Пойдём вместе?»,
 * а в версии для Instagram между телефоном и надписью — рамка под стикер «Ссылка».
 * Только flex-вёрстка и картинки: так рисует Satori (next/og).
 */

export interface PhoneStoryData {
  title: string;
  description: string | null;
  coverUrl: string | null; // data: URL
  coverRatio: number; // ширина / высота
  blurUrl: string | null; // крошечная копия — размытый фон экрана
  who: { name: string; avatar: string | null; initial: string };
  dateTop: string; // «сегодня» / «завтра» / «среда»
  day: number;
  month: string; // «октября»
  time: string;
  city: string;
  place: string;
  street: string;
  free: number;
  seatsWord: string;
  catIcon: string | null; // data: URL
  logo: string; // data: URL
  shadowRect: string;
  ig: boolean;
}

const ink = "#16121F";
const violet = "#6C3BFF";
const grey = "#6B6585";

const svg = (body: string, size = 30, stroke = "#fff") =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  ).toString("base64")}`;
const I = {
  heart: svg('<path d="M12 20.5s-7.5-4.6-9.6-9.3C.9 7.7 3.2 4 6.9 4c2 0 3.6 1.1 4.6 2.6.9-1.5 2.6-2.6 4.6-2.6 3.7 0 6 3.7 4.5 7.2-2.1 4.7-8.6 9.3-8.6 9.3z"/>', 34),
  save: svg('<path d="M6 3.5h12v17l-6-4-6 4z"/>', 34),
  share: svg('<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 13v6.5h14V13"/>', 34),
  clock: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2.5h6"/>'),
  pin: svg('<path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  pinV: svg('<path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', 28, violet),
};

function clip(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/[\s,.;:!-]+\S*$/, "")}…` : t;
}

export function PhoneStory(d: PhoneStoryData) {
  // Телефон: 500×1080, экран 474×1054. Ниже — рамка под стикер (только ig) и надпись.
  const PX = 290;
  const PY = 300;
  const PW = 500;
  const PH = 1080;
  const title = clip(d.title, 60);
  const titleSize = title.length <= 22 ? 46 : title.length <= 40 ? 40 : 34;
  const desc = d.description ? clip(d.description, 110) : null;
  const SW = PW - 26;
  const SH = PH - 26;
  // Фото целиком: на всю ширину экрана, высота — по пропорциям (не выше 62% экрана).
  const photoH = Math.round(Math.min(SW / (d.coverRatio || 4 / 3), SH * 0.62));
  const photoTop = 0;
  const textTop = Math.max(photoTop + photoH - 30, 300);

  const Shade = ({ x, y, w, h, o = 0.35 }: { x: number; y: number; w: number; h: number; o?: number }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={d.shadowRect}
      alt=""
      width={Math.round(w * 1.4)}
      height={Math.round(h * 1.4)}
      style={{ position: "absolute", left: Math.round(x - w * 0.2), top: Math.round(y - h * 0.2 + 24), width: Math.round(w * 1.4), height: Math.round(h * 1.4), opacity: o }}
    />
  );
  const card = { position: "absolute" as const, background: "#fff", borderRadius: 30, border: "1.5px solid rgba(108,59,255,0.10)", display: "flex", flexDirection: "column" as const };
  const railBtn = { width: 68, height: 68, borderRadius: 68, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center" } as const;

  return (
    <div style={{ width: 1080, height: 1920, display: "flex", position: "relative", fontFamily: "Golos", color: ink, background: "#FFFFFF" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, display: "flex", backgroundImage: "radial-gradient(circle at 12% 6%, #EFE8FF 0%, rgba(255,255,255,0) 45%), radial-gradient(circle at 96% 70%, #F4ECFF 0%, rgba(255,255,255,0) 42%)" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.logo} alt="" width={284} height={60} style={{ position: "absolute", left: 398, top: 100, width: 284, height: 60 }} />

      <Shade x={PX} y={PY} w={PW} h={PH} o={0.3} />
      <div style={{ position: "absolute", left: PX - 4, top: PY - 4, width: PW + 8, height: PH + 8, borderRadius: 86, background: "#C9C2D9", display: "flex" }} />
      <div style={{ position: "absolute", left: PX, top: PY, width: PW, height: PH, borderRadius: 82, background: "#0B0910", padding: 13, display: "flex" }}>
        <div style={{ width: PW - 26, height: PH - 26, borderRadius: 70, overflow: "hidden", position: "relative", display: "flex", background: "#2A2238", color: "#fff" }}>
          {/* Фон экрана — размытая копия фото, сильно затемнённая; сверху — фото целиком, в своих пропорциях. */}
          {d.blurUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.blurUrl} alt="" width={SW + 120} height={SH + 120} style={{ position: "absolute", left: -60, top: -60, width: SW + 120, height: SH + 120, objectFit: "cover" }} />
          ) : null}
          <div style={{ position: "absolute", left: 0, top: 0, width: SW, height: SH, display: "flex", background: "rgba(12,8,22,0.86)" }} />
          {d.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.coverUrl} alt="" width={SW} height={photoH} style={{ position: "absolute", left: 0, top: photoTop, width: SW, height: photoH, objectFit: "cover" }} />
          ) : (
            <div style={{ position: "absolute", left: 0, top: photoTop, width: SW, height: photoH, display: "flex", backgroundImage: "linear-gradient(160deg,#4B1FB8,#6C3BFF 55%,#A24DFF)" }} />
          )}
          <div style={{ position: "absolute", left: 0, top: photoTop + photoH - 160, width: SW, height: 162, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(12,8,22,0) 0%, rgba(12,8,22,0.95) 100%)" }} />
          <div style={{ position: "absolute", left: 0, top: 0, width: SW, height: 120, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 100%)" }} />
          <div style={{ position: "absolute", left: 157, top: 16, width: 160, height: 46, borderRadius: 30, background: "#000", display: "flex" }} />
          <div style={{ position: "absolute", left: 56, top: 26, fontSize: 24, fontWeight: 700, display: "flex" }}>9:41</div>

          {/* Поверх фото: кто зовёт, название, описание, кнопки */}
          <div style={{ position: "absolute", left: 34, width: 330, top: textTop, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: 22, fontWeight: 500 }}>
              {d.who.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.who.avatar} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: 44, border: "2px solid #fff", objectFit: "cover", marginRight: 12 }} />
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: 44, border: "2px solid #fff", background: ink, marginRight: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700 }}>{d.who.initial}</div>
              )}
              <div style={{ display: "flex" }}>{d.who.name}</div>
            </div>
            <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1, marginTop: 16, display: "flex" }}>{title}</div>
            {desc ? <div style={{ fontSize: 21, lineHeight: 1.35, color: "rgba(255,255,255,0.82)", marginTop: 12, display: "flex" }}>{desc}</div> : null}
            <div style={{ display: "flex", marginTop: 22 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={I.heart} alt="" width={34} height={34} style={{ marginRight: 26 }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={I.save} alt="" width={34} height={34} style={{ marginRight: 26 }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={I.share} alt="" width={34} height={34} />
            </div>
          </div>
          <div style={{ position: "absolute", right: 22, bottom: 68, display: "flex", flexDirection: "column", alignItems: "center" }}>
            {d.catIcon ? (
              <div style={{ ...railBtn, background: "rgba(255,255,255,0.94)", marginBottom: 16 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.catIcon} alt="" width={50} height={50} />
              </div>
            ) : null}
            {[I.clock, I.pin, I.chat].map((src, i) => (
              <div key={i} style={{ ...railBtn, marginBottom: 16 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" width={30} height={30} />
              </div>
            ))}
            <div style={{ width: 84, height: 84, borderRadius: 84, backgroundImage: "linear-gradient(120deg,#6C3BFF,#A24DFF)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 700, lineHeight: 1.05 }}>
              <div style={{ display: "flex" }}>Я</div>
              <div style={{ display: "flex" }}>иду</div>
            </div>
          </div>
        </div>
      </div>

      {/* Дата */}
      <Shade x={52} y={420} w={200} h={230} o={0.18} />
      <div style={{ ...card, left: 52, top: 420, width: 200, padding: "22px 0", alignItems: "center" }}>
        <div style={{ fontSize: 20, color: grey, display: "flex" }}>{d.dateTop}</div>
        <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1, marginTop: 6, display: "flex" }}>{String(d.day)}</div>
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, display: "flex" }}>{d.month}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: violet, marginTop: 8, display: "flex" }}>{`в ${d.time}`}</div>
      </div>

      {/* Где: город, место, улица */}
      <Shade x={740} y={340} w={300} h={150} o={0.18} />
      <div style={{ ...card, left: 740, top: 340, width: 300, padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={I.pinV} alt="" width={26} height={26} style={{ marginRight: 10 }} />
          <div style={{ fontSize: 20, color: grey, display: "flex" }}>{d.city}</div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.15, marginTop: 8, display: "flex" }}>{clip(d.place, 34)}</div>
        {d.street ? <div style={{ fontSize: 20, color: grey, marginTop: 4, display: "flex" }}>{clip(d.street, 34)}</div> : null}
      </div>

      {/* Сколько мест нужно */}
      <Shade x={52} y={970} w={230} h={160} o={0.18} />
      <div style={{ ...card, left: 52, top: 970, width: 230, padding: "20px 22px" }}>
        {d.free > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 20, color: grey, display: "flex" }}>нужно ещё</div>
            <div style={{ fontSize: 70, fontWeight: 700, lineHeight: 1, marginTop: 6, color: violet, display: "flex" }}>{String(d.free)}</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, display: "flex" }}>{d.seatsWord}</div>
          </div>
        ) : (
          <div style={{ fontSize: 30, fontWeight: 700, display: "flex" }}>Мест нет</div>
        )}
      </div>

      {d.ig ? (
        <div style={{ position: "absolute", left: 290, top: PY + PH + 44, width: 500, height: 96, border: "3px dashed rgba(108,59,255,0.4)", borderRadius: 48, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: "#8A84A0" }}>
          сюда — стикер «Ссылка»
        </div>
      ) : null}

      <div style={{ position: "absolute", left: 0, top: d.ig ? 1565 : 1500, width: 1080, display: "flex", flexDirection: "column", alignItems: "center", fontSize: 112, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3.5 }}>
        <div style={{ display: "flex" }}>Пойдём</div>
        <div style={{ display: "flex", color: violet }}>вместе?</div>
      </div>
    </div>
  );
}
