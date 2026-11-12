type Pool = { callbacks: Map<Element, () => void>; near: Set<Element>; visible: boolean; cards: IntersectionObserver; viewport?: IntersectionObserver };
const pools = new Map<Element | null, Pool>();

/** One observer per rail, with a viewport gate so lower rails do not load yet. */
export function observeCover(element: Element, ready: () => void) {
  if (typeof IntersectionObserver === "undefined") { ready(); return () => {}; }
  const root = element.closest(".k-hs");
  let pool = pools.get(root);
  if (!pool) {
    const state = { callbacks: new Map(), near: new Set(), visible: !root } as Pool;
    const flush = () => {
      if (!state.visible) return;
      for (const target of state.near) state.callbacks.get(target)?.();
    };
    state.cards = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) state.near.add(entry.target);
        else state.near.delete(entry.target);
      }
      flush();
    }, { root, rootMargin: root ? "0px 400px" : "300px 0px" });
    if (root) {
      state.viewport = new IntersectionObserver(entries => {
        state.visible = entries.some(entry => entry.isIntersecting);
        flush();
      }, { rootMargin: "300px 0px" });
      state.viewport.observe(root);
    }
    pools.set(root, state);
    pool = state;
  }
  const active = pool;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    active.callbacks.delete(element);
    active.near.delete(element);
    active.cards.unobserve(element);
    if (!active.callbacks.size) {
      active.cards.disconnect(); active.viewport?.disconnect();
      if (pools.get(root) === active) pools.delete(root);
    }
  };
  active.callbacks.set(element, () => { stop(); ready(); });
  active.cards.observe(element);
  return stop;
}
