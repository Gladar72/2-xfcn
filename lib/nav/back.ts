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
const DEPTH_KEY = "__mestoNavDepth";

export function installNavDepth() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const H = window.history;
  const push0 = H.pushState.bind(H);
  const replace0 = H.replaceState.bind(H);
  depth = Number.isInteger(H.state?.[DEPTH_KEY]) ? H.state[DEPTH_KEY] : 0;
  replace0({ ...H.state, [DEPTH_KEY]: depth }, "", window.location.href);
  H.replaceState = (state, unused, url) => replace0({ ...state, [DEPTH_KEY]: depth }, unused, url);
  H.pushState = (state, unused, url) => {
    const target = new URL(url == null ? window.location.href : String(url), window.location.href);
    // Repeated state updates for the current screen must not require repeated
    // taps on Back. Preserve Next's state, but replace the current entry.
    if (target.href === window.location.href) {
      return replace0({ ...state, [DEPTH_KEY]: depth }, unused, url);
    }
    const next = depth + 1;
    push0({ ...state, [DEPTH_KEY]: next }, unused, url);
    depth = next;
  };
  window.addEventListener("popstate", (event) => {
    depth = Number.isInteger(event.state?.[DEPTH_KEY]) ? event.state[DEPTH_KEY] : 0;
  });
}

export function goBack(router: { back: () => void; replace: (href: string) => void }, fallback = "/feed") {
  if (depth > 0) router.back();
  else router.replace(fallback);
}
