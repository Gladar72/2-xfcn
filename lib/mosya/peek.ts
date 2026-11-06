import { mosyaSrc, type MosyaPose } from "@/components/brand/Mosya";

/**
 * Мося выглядывает сбоку экрана с облачком (как в прототипе): выпрыгивает
 * снизу с пружиной, машет, облачко появляется следом. Прячется сам через
 * несколько секунд, по тапу на него или при любом действии на экране —
 * формы и кнопки остаются доступными.
 */
export function peek(opts: { pose?: MosyaPose; text: string; ms?: number; low?: boolean; quick?: boolean }) {
  // 06.11: Мося больше не выскакивает — вместо него короткая плашка внизу (без картинки).
  if (typeof document === "undefined") return;
  document.querySelectorAll(".m-note").forEach((o) => o.remove());
  const n = document.createElement("div");
  n.className = "m-note";
  n.setAttribute("role", "status");
  n.textContent = opts.text;
  document.body.appendChild(n);
  requestAnimationFrame(() => n.classList.add("on"));
  const hide = () => {
    n.classList.remove("on");
    setTimeout(() => n.remove(), 300);
  };
  n.onclick = hide;
  setTimeout(hide, opts.ms ?? Math.max(opts.quick ? 2600 : 3600, Math.min(6000, opts.text.length * 55)));
}
void mosyaSrc;

/** Короткий комментарий Моси к ошибке или событию. */
export function say(text: string, pose: MosyaPose = "think") {
  peek({ text, pose, quick: true, low: true });
}
