"use client";

/**
 * «Назад» внутри приложения. router.back() уводит из приложения (или по кругу
 * между экранами), если человек открыл экран по ссылке из Telegram и истории
 * внутри приложения нет. Поэтому считаем, сколько шагов вглубь сделано
 * внутри приложения: есть куда вернуться — возвращаемся, нет — идём на
 * понятный экран (обычно «Главная»).
 */
let depth = 0;
let installed = false;

export function installNavDepth() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const H = window.history;
  const push0 = H.pushState.bind(H);
  H.pushState = (...a: Parameters<History["pushState"]>) => {
    depth += 1;
    return push0(...a);
  };
  window.addEventListener("popstate", () => {
    depth = Math.max(0, depth - 1);
  });
}

export function goBack(router: { back: () => void; replace: (href: string) => void }, fallback = "/feed") {
  if (depth > 0) router.back();
  else router.replace(fallback);
}
