/**
 * Сторис «Поделиться событием» — приглашение (согласовано 20.10).
 * Белый фон, всё по центру по одной ширине 920: логотип, «Иду в среду. Пойдёшь со мной?»,
 * фото встречи целиком (со своим цветным свечением), на фото — стеклянные плашки
 * (кто зовёт, иконка категории, Когда / Где / Нужно ещё), ниже крупно название,
 * рамка под ссылку и Мося, который её держит. Меняются только данные и картинка.
 * Satori: только flex и картинки; «стекло» — размытая копия фото внутри плашки.
 */
import type { ReactNode } from "react";

export interface InviteStoryData {
  kicker: string;
  title: string;
  coverUrl: string | null;
  coverRatio: number;
  blurUrl: string | null;
  glowUrl: string | null; // svg-свечение из цветов фото
  who: { name: string; avatar: string | null; initial: string };
  catIcon: string | null;
  when: string;
  time: string;
  whereLabel: string;
  place: string;
  street: string;
  free: number;
  seatsTotal: number;
  logo: string;
  mosya: string;
  ig: boolean;
}

const ink = "#16121F";
const violet = "#6C3BFF";
const W = 920;
const X = 80;

export function InviteStory(d: InviteStoryData) {
  const photoH = Math.round(Math.max(520, Math.min(W / (d.coverRatio || 4 / 3), 780)));
  // Фото всегда заполняет рамку без полей: считаем «cover» сами (Satori не всегда его соблюдает)
  // и чуть увеличиваем (+5%), чтобы срезать белые края у афиш и скриншотов.
  const ratio = d.coverRatio || 4 / 3;
  const ZOOM = 1.05;
  const fit = (() => {
    const w0 = Math.max(W, photoH * ratio) * ZOOM;
    const h0 = w0 / ratio;
    const w = Math.ceil(w0);
    const h = Math.ceil(Math.max(h0, photoH * ZOOM));
    const ww = Math.ceil(Math.max(w, h * ratio));
    return { w: ww, h, x: Math.round((W - ww) / 2), y: Math.round((photoH - h) / 2) };
  })();
  const t = d.title.replace(/\s+/g, " ").trim();
  const titleSize = t.length <= 20 ? 84 : t.length <= 34 ? 76 : t.length <= 50 ? 64 : 56;
  const perLine = Math.floor(W / (titleSize * 0.58));
  const titleLines = Math.min(3, Math.max(1, Math.ceil(t.length / perLine)));
  const titleH = Math.round(titleLines * titleSize * 1.06);

  // Высота всего блока — чтобы поставить его ровно по центру между зонами Instagram (сверху и снизу).
  const LOGO = 42;
  const KICK = 42;
  const STICK = 96;
  const blockH = LOGO + 44 + KICK + 36 + photoH + 52 + titleH + 60 + STICK + 70;
  const top = Math.round(200 + Math.max(0, (1500 - blockH) / 2));
  const yLogo = top;
  const yKick = yLogo + LOGO + 44;
  const yPhoto = yKick + KICK + 36;
  const yTitle = yPhoto + photoH + 52;
  const yStick = yTitle + titleH + 60;

  const panelH = 168;
  const panelX = 24;
  const panelY = photoH - 24 - panelH;
  const panelW = W - 48;

  // «Стекло»: внутри плашки — размытая копия фото, сдвинутая так, чтобы совпасть с фото под ней.
  const Glass = ({ x, y, w, h, r, children, row }: { x: number; y: number; w: number; h: number; r: number; children?: ReactNode; row?: boolean }) => (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: r, overflow: "hidden", display: "flex", border: "1.5px solid rgba(255,255,255,0.5)" }}>
      {d.blurUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.blurUrl} alt="" width={fit.w} height={fit.h} style={{ position: "absolute", left: fit.x - x, top: fit.y - y, width: fit.w, height: fit.h }} />
      ) : null}
      <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, display: "flex", background: "rgba(22,14,40,0.34)" }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 100%)" }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, display: "flex", flexDirection: row ? "row" : "column", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );

  const whoW = Math.min(560, 120 + Math.round(d.who.name.length * 14));
  const Col = ({ label, value, sub, first }: { label: string; value: string; sub: string; first?: boolean }) => (
    <div style={{ width: Math.floor(panelW / 3), height: panelH - 40, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderLeft: first ? "none" : "1.5px solid rgba(255,255,255,0.32)", padding: "0 14px" }}>
      <div style={{ fontSize: 20, letterSpacing: 2, color: "rgba(255,255,255,0.78)", display: "flex" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: "#fff", marginTop: 8, lineHeight: 1.12, textAlign: "center", display: "flex", justifyContent: "center" }}>{value}</div>
      {sub ? <div style={{ fontSize: 21, color: "rgba(255,255,255,0.86)", marginTop: 4, display: "flex" }}>{sub}</div> : null}
    </div>
  );

  return (
    <div style={{ width: 1080, height: 1920, display: "flex", position: "relative", background: "#FFFFFF", color: ink, fontFamily: "Golos" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.logo} alt="" width={199} height={42} style={{ position: "absolute", left: 440, top: yLogo, width: 199, height: 42 }} />
      <div style={{ position: "absolute", left: 0, top: yKick, width: 1080, display: "flex", justifyContent: "center", fontSize: 34, fontWeight: 500, color: violet }}>{d.kicker}</div>

      {d.glowUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.glowUrl} alt="" width={W + 160} height={photoH + 160} style={{ position: "absolute", left: X - 80, top: yPhoto - 40, width: W + 160, height: photoH + 160 }} />
      ) : null}
      <div style={{ position: "absolute", left: X, top: yPhoto, width: W, height: photoH, borderRadius: 48, overflow: "hidden", display: "flex", background: "#2A2238", border: "1.5px solid rgba(22,18,31,0.08)" }}>
        {d.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.coverUrl} alt="" width={fit.w} height={fit.h} style={{ position: "absolute", left: fit.x, top: fit.y, width: fit.w, height: fit.h }} />
        ) : (
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: photoH, display: "flex", backgroundImage: "linear-gradient(160deg,#4B1FB8,#6C3BFF 55%,#A24DFF)" }} />
        )}
        <div style={{ position: "absolute", left: 0, top: Math.round(photoH * 0.45), width: W, height: Math.round(photoH * 0.55), display: "flex", backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.32) 100%)" }} />

        <Glass x={24} y={24} w={whoW} h={72} r={36} row>
          <div style={{ display: "flex", alignItems: "center", width: whoW - 20, paddingLeft: 0 }}>
            {d.who.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.who.avatar} alt="" width={52} height={52} style={{ width: 52, height: 52, borderRadius: 52, border: "2px solid rgba(255,255,255,0.85)", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 52, height: 52, borderRadius: 52, background: ink, border: "2px solid rgba(255,255,255,0.85)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 24, fontWeight: 700 }}>{d.who.initial}</div>
            )}
            <div style={{ display: "flex", marginLeft: 14, fontSize: 25, fontWeight: 700, color: "#fff" }}>{d.who.name}</div>
          </div>
        </Glass>
        {d.catIcon ? (
          <Glass x={W - 24 - 72} y={24} w={72} h={72} r={72}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.catIcon} alt="" width={50} height={50} />
          </Glass>
        ) : null}

        <Glass x={panelX} y={panelY} w={panelW} h={panelH} r={34} row>
          <Col label="Когда" value={d.when} sub={`в ${d.time}`} first />
          <Col label={d.whereLabel} value={d.place} sub={d.street} />
          <Col label="Нужно ещё" value={d.free > 0 ? String(d.free) : "мест нет"} sub={d.free > 0 ? `${seatsWordShort(d.free)} из ${d.seatsTotal}` : ""} />
        </Glass>
      </div>

      <div style={{ position: "absolute", left: X, top: yTitle, width: W, display: "flex", justifyContent: "center", textAlign: "center", fontSize: titleSize, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2.5 }}>{t}</div>

      <div style={{ position: "absolute", left: 260, top: yStick, width: 560, height: STICK, borderRadius: 48, border: "2.5px dashed rgba(108,59,255,0.35)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#8A84A0" }}>
        {d.ig ? "сюда — стикер «Ссылка»" : "сюда — ссылка «Я иду»"}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.mosya} alt="" width={210} height={210} style={{ position: "absolute", left: 90, top: yStick - 30, width: 210, height: 210, transform: "rotate(-8deg)" }} />
    </div>
  );
}

function seatsWordShort(n: number): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return "место";
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return "места";
  return "мест";
}
