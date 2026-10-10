import { mosyaSrc, type MosyaPose } from "./Mosya";

/**
 * «Живой» Мося — движок из согласованного прототипа.
 * Мося непрерывно и плавно гуляет по «полу» слоя, сам выбирает цель:
 * подойти и потрогать эмодзи-персонажа, пройтись, помахать или подумать.
 * Персонажи отзываются: вмятинка в месте касания, смотрят глазами,
 * отскакивают, подпрыгивают или крутятся (пружинная физика).
 * Позы меняются плавным перекрёстным затуханием картинок.
 */
export interface AliveOptions {
  /** Y-координата «пола» (px от верха слоя), на нём стоит Мося. */
  floor: number;
  /** Стартовая X-координата центра. */
  x?: number;
  /** Размер Моси в px. */
  size?: number;
  thinkPose?: MosyaPose;
}

export interface AliveHandle {
  stop: () => void;
  x: () => number;
}

interface Prop {
  el: HTMLElement;
  sp: HTMLElement;
  x: number;
  y: number;
  r: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  sq: number;
  cool: number;
}

type Goal =
  | { type: "touch"; p: Prop; tm: number; done?: boolean }
  | { type: "walk"; x: number }
  | { type: "wave" | "think"; tm: number; dur: number };

export function startAlive(layer: HTMLElement, o: AliveOptions): AliveHandle {
  const S = o.size ?? 150;
  const FLOOR = o.floor;
  const W = () => layer.clientWidth || 360;

  const m = document.createElement("div");
  m.className = "m-mo";
  m.style.width = m.style.height = S + "px";
  m.innerHTML = `<div class="m-mo-j"><div class="m-mo-f"><img class="on" src="${mosyaSrc("stand")}" alt=""><img alt=""></div></div><span class="m-mo-sh"></span>`;
  layer.appendChild(m);
  const jw = m.firstElementChild as HTMLElement;
  const fl = jw.firstElementChild as HTMLElement;
  const sh = m.lastElementChild as HTMLElement;

  // Предзагрузка поз, чтобы смена была мгновенной
  (["wave", "run", "think", o.thinkPose ?? "think"] as MosyaPose[]).forEach((p) => {
    const i = new Image();
    i.src = mosyaSrc(p);
  });

  const P: Prop[] = Array.from(layer.querySelectorAll<HTMLElement>(".m-prop")).map((el) => ({
    el,
    sp: el.firstElementChild as HTMLElement,
    x: +(el.dataset.x ?? 0),
    y: +(el.dataset.y ?? 0),
    r: +(el.dataset.s ?? 80) / 2,
    ox: 0,
    oy: 0,
    vx: 0,
    vy: 0,
    rot: 0,
    vr: 0,
    sq: 0,
    cool: 0,
  }));

  const L = {
    x: o.x ?? W() / 2,
    v: 0,
    ph: 0,
    t: 0,
    goal: null as Goal | null,
    tilt: 0,
    pose: "stand" as MosyaPose,
    face: 1,
    str: 0,
    pushed: 0,
    dead: false,
  };
  const rb = S * 0.3;

  const pose = (n: MosyaPose) => {
    if (L.pose === n) return;
    L.pose = n;
    const imgs = Array.from(fl.querySelectorAll("img"));
    const cur = imgs.find((i) => i.classList.contains("on"))!;
    const nx = imgs.find((i) => i !== cur)!;
    nx.src = mosyaSrc(n);
    nx.classList.add("on");
    cur.classList.remove("on");
  };

  const dent = (p: Prop, where: string) => {
    const d = document.createElement("i");
    d.className = "dent " + where;
    p.el.appendChild(d);
    const a = d.animate(
      [
        { opacity: 0, transform: "scale(.4)" },
        { opacity: 0.85, transform: "scale(1)", offset: 0.15 },
        { opacity: 0.55, offset: 0.5 },
        { opacity: 0, transform: "scale(1.15)" },
      ],
      { duration: 3600, easing: "ease-out", fill: "forwards" }
    );
    a.onfinish = () => d.remove();
  };

  const react = (p: Prop, kind: string) => {
    p.cool = 1.6;
    const sg = Math.sign(p.x - L.x) || 1;
    if (kind === "push") {
      p.vx -= sg * 110;
      L.v = -sg * 95;
      L.pushed = 0.7;
    } else if (kind === "spin") p.vr += sg * 720;
    else if (kind === "hop") p.vy -= 280;
    else p.vx += sg * 50;
  };

  const pick = () => {
    const r = Math.random();
    if (r < 0.48 && P.length) L.goal = { type: "touch", p: P[Math.floor(Math.random() * P.length)], tm: 0 };
    else if (r < 0.78) L.goal = { type: "walk", x: W() * (0.32 + Math.random() * 0.36) };
    else L.goal = { type: Math.random() < 0.5 ? "wave" : "think", tm: 0, dur: 2 + Math.random() * 1.5 };
  };

  let last = performance.now();
  let raf = 0;
  const step = (now: number) => {
    if (L.dead) return;
    if (!layer.isConnected) {
      L.dead = true;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    L.t += dt;
    if (!L.goal) pick();
    const g = L.goal!;
    let tx = L.x;
    if (g.type === "walk") {
      tx = g.x;
      if (Math.abs(L.x - g.x) < 5 && Math.abs(L.v) < 10) L.goal = null;
    } else if (g.type === "touch") {
      const p = g.p;
      const up = p.y + p.r < FLOOR - 20;
      const side = Math.sign(L.x - p.x) || 1;
      tx = up ? Math.max(W() * 0.32, Math.min(W() * 0.68, p.x)) : p.x + side * (p.r + rb - 10);
      if (Math.abs(L.x - tx) < 6 && Math.abs(L.v) < 12) {
        g.tm += dt;
        pose("wave");
        L.str = up ? 1 : 0;
        if (!g.done && g.tm > 0.45) {
          g.done = true;
          dent(p, up ? "bot" : side > 0 ? "rt" : "lf");
          if (p.cool <= 0) react(p, ["push", "hop", "spin", "nudge", "nudge"][Math.floor(Math.random() * 5)]);
        }
        if (g.tm > 1.9) {
          L.goal = null;
          L.str = 0;
          pose("stand");
        }
      }
    } else {
      g.tm += dt;
      pose(g.type === "wave" ? "wave" : o.thinkPose ?? "think");
      if (g.tm > g.dur) {
        L.goal = null;
        pose("stand");
      }
    }
    if (g && (g.type === "walk" || (g.type === "touch" && !g.tm))) {
      const av = Math.abs(L.v);
      if (av > 34) pose("run");
      else if (av < 16) pose("stand");
    }
    if (L.pushed > 0) {
      L.pushed -= dt;
      L.v *= Math.pow(0.2, dt);
    } else {
      const vd = Math.max(-70, Math.min(70, (tx - L.x) * 1.5));
      L.v += (vd - L.v) * Math.min(1, dt * 2.2);
    }
    L.x = Math.max(S * 0.4, Math.min(W() - S * 0.4, L.x + L.v * dt));
    if (Math.abs(L.v) > 6) L.face = L.v > 0 ? 1 : -1;
    const walk = Math.min(1, Math.abs(L.v) / 45);
    L.ph += Math.abs(L.v) * dt * 0.11;

    P.forEach((p) => {
      p.cool -= dt;
      const floor = p.y + p.r > FLOOR - 20;
      let tx2 = 0;
      let ty2 = 0;
      if (floor) {
        const ov = p.r + rb - Math.abs(p.x - L.x);
        if (ov > 0) {
          const sg = Math.sign(p.x - L.x) || 1;
          tx2 = sg * Math.min(ov, 16) * 0.9;
          p.sq += (Math.min(0.15, ov / 80) - p.sq) * Math.min(1, dt * 7);
          if (Math.sign(L.v) === sg && Math.abs(L.v) > 4) L.v *= Math.pow(0.05, dt);
        } else p.sq *= Math.pow(0.02, dt);
      } else if (L.str && Math.abs(p.x - L.x) < p.r + 34) {
        ty2 = -10;
        p.sq += (0.1 - p.sq) * Math.min(1, dt * 6);
      } else p.sq *= Math.pow(0.02, dt);
      p.vx += (-60 * (p.ox - tx2) - 8 * p.vx) * dt;
      p.vy += (-60 * (p.oy - ty2) - 8 * p.vy) * dt;
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
      p.ox = Math.max(-36, Math.min(36, p.ox));
      p.vr += (-35 * p.rot - 6 * p.vr) * dt;
      p.rot += p.vr * dt;
      const lx = Math.max(-3, Math.min(3, (L.x - p.x) / 28));
      const ly = Math.max(-2, Math.min(2, (FLOOR - S * 0.6 - p.y) / 60));
      p.sp.style.transform = `translate(${p.ox}px,${p.oy}px) rotate(${p.rot}deg) scale(${1 - p.sq},${1 + p.sq * 0.6})`;
      p.el.querySelectorAll(".eye,.pp").forEach((e) => e.setAttribute("transform", `translate(${lx} ${ly})`));
    });

    L.tilt += ((L.v / 70) * 6 - L.tilt) * Math.min(1, dt * 3.5);
    const bob = -Math.abs(Math.sin(L.ph)) * 5 * walk;
    const sway = Math.sin(L.ph) * 4 * walk + Math.sin(L.t * 1.6) * 1.2 * (1 - walk);
    const br = Math.sin(L.t * 2.1) * 0.014;
    const st = L.str * 0.06;
    fl.style.transform = `scaleX(${L.face})`;
    jw.style.transform = `translateY(${bob - L.str * 8}px) rotate(${L.tilt + sway}deg) scale(${1 - br - st * 0.4},${1 + br + st})`;
    m.style.transform = `translate(${L.x - S / 2}px,${FLOOR - S}px)`;
    sh.style.transform = `scaleX(${1 - Math.abs(bob) / 28})`;
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  const onMo = (e: Event) => {
    e.stopPropagation();
    L.goal = { type: "wave", tm: 0, dur: 2.2 };
  };
  const onLayer = (e: Event) => {
    const el = (e.target as HTMLElement).closest(".m-prop");
    if (!el) return;
    const p = P.find((x) => x.el === el);
    if (!p) return;
    react(p, "hop");
    L.goal = { type: "touch", p, tm: 0 };
  };
  m.addEventListener("click", onMo);
  layer.addEventListener("click", onLayer);

  return {
    stop: () => {
      L.dead = true;
      cancelAnimationFrame(raf);
      layer.removeEventListener("click", onLayer);
      m.remove();
    },
    x: () => L.x,
  };
}
