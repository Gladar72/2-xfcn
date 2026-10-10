import { mosyaSrc, type MosyaPose } from "@/components/brand/Mosya";

/**
 * Мося выглядывает сбоку экрана с облачком (как в прототипе): выпрыгивает
 * снизу с пружиной, машет, облачко появляется следом. Прячется сам через
 * несколько секунд, по тапу на него или при любом действии на экране —
 * формы и кнопки остаются доступными.
 */
export function peek(opts: { pose?: MosyaPose; text: string; ms?: number; low?: boolean; quick?: boolean }) {
  if (typeof document === "undefined") return;
  document.querySelectorAll<HTMLElement & { _hide?: (f?: boolean) => void }>(".m-peek").forEach((o) => o._hide?.(true));
  const p = document.createElement("div") as HTMLDivElement & { _hide?: (f?: boolean) => void; _h?: boolean };
  p.className = "m-peek" + (opts.low ? " low" : "");
  p.setAttribute("role", "status");
  const bb = document.createElement("div");
  bb.className = "bb";
  bb.textContent = opts.text;
  bb.appendChild(document.createElement("i"));
  const im = document.createElement("img");
  im.src = mosyaSrc(opts.pose ?? "wave");
  im.alt = "";
  p.append(bb, im);
  document.body.appendChild(p);

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    im.style.transform = "none";
    bb.style.opacity = "1";
  } else {
    im.animate(
      [{ transform: "translateY(130%) rotate(0)" }, { transform: "translateY(-6%) rotate(-6deg)", offset: 0.55 }, { transform: "translateY(0) rotate(0)" }],
      { duration: 560, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "forwards" }
    );
    bb.animate([{ opacity: 0, transform: "scale(.4) translate(40px,30px)" }, { opacity: 1, transform: "none" }], {
      duration: 420,
      delay: 360,
      easing: "cubic-bezier(.34,1.56,.64,1)",
      fill: "both",
    });
    setTimeout(
      () =>
        im.animate(
          [{ transform: "rotate(0)" }, { transform: "rotate(-10deg)" }, { transform: "rotate(8deg)" }, { transform: "rotate(-6deg)" }, { transform: "rotate(0)" }],
          { duration: 800, iterations: opts.quick ? 1 : 2 }
        ),
      600
    );
  }

  const off = (e: Event) => {
    if (p.contains(e.target as Node)) return;
    hide();
  };
  const hide = (fast?: boolean) => {
    if (p._h) return;
    p._h = true;
    document.removeEventListener("pointerdown", off, true);
    document.removeEventListener("focusin", off, true);
    bb.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: "forwards" });
    const a = im.animate(
      [{ transform: "translateY(0)" }, { transform: "translateY(-10%)", offset: 0.25 }, { transform: "translateY(130%)" }],
      { duration: fast ? 220 : 460, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" }
    );
    a.onfinish = () => p.remove();
    setTimeout(() => p.remove(), 700);
  };
  p._hide = hide;
  p.onclick = () => hide();
  setTimeout(() => hide(), opts.ms ?? Math.max(opts.quick ? 2100 : 4200, opts.text.length * 62));
  setTimeout(() => {
    document.addEventListener("pointerdown", off, true);
    document.addEventListener("focusin", off, true);
  }, 900);
}

/** Короткий комментарий Моси к ошибке или событию. */
export function say(text: string, pose: MosyaPose = "think") {
  peek({ text, pose, quick: true, low: true });
}
